import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  LedgerAccount,
  LedgerAccountStatus,
  LedgerAccountType,
} from './entities/ledger-account.entity.js';

import {
  LedgerEntry,
  LedgerEntryType,
} from './entities/ledger-entry.entity.js';

import {
  LedgerJournal,
  LedgerJournalStatus,
} from './entities/ledger-journal.entity.js';
import { LedgerJournalFilterDto } from './dto/ledger-journal-filter.dto.js';

interface JournalLineInput {
  accountId: string;
  type: LedgerEntryType;
  amount: string;
  description?: string;
}

interface PostJournalInput {
  merchantId: string;
  referenceType: string;
  referenceId: string;
  currency: string;
  description?: string;
  entries: JournalLineInput[];
}

export interface PostJournalResult {
  journal: LedgerJournal;
  entries: LedgerEntry[];
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accountRepository: Repository<LedgerAccount>,

    @InjectRepository(LedgerEntry)
    private readonly entryRepository: Repository<LedgerEntry>,

    @InjectRepository(LedgerJournal)
    private readonly journalRepository: Repository<LedgerJournal>,

    private readonly dataSource: DataSource,
  ) {}

  async createAccount(
    merchantId: string | null,
    name: string,
    code: string,
    type: LedgerAccountType,
    currency = 'INR',
  ) {
    const existingAccount = await this.accountRepository.findOne({
      where: {
        merchantId: merchantId === null ? IsNull() : merchantId,
        code,
      },
    });

    if (existingAccount) {
      throw new ConflictException(
        'Ledger account with this code already exists',
      );
    }

    const account = this.accountRepository.create({
      merchantId,
      name,
      code,
      type,
      currency,
      status: LedgerAccountStatus.ACTIVE,
    });

    try {
      return await this.accountRepository.save(account);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error as QueryFailedError & {
            driverError?: { code?: string };
          }
        ).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'Ledger account with this code already exists',
        );
      }

      throw error;
    }
  }

  async createSystemAccounts() {
    const systemAccounts = [
      {
        name: 'Payment Clearing',
        code: 'PAYMENT_CLEARING',
        type: LedgerAccountType.ASSET,
        currency: 'INR',
      },
      {
        name: 'Merchant Payable',
        code: 'MERCHANT_PAYABLE',
        type: LedgerAccountType.LIABILITY,
        currency: 'INR',
      },
      {
        name: 'Refund Clearing',
        code: 'REFUND_CLEARING',
        type: LedgerAccountType.ASSET,
        currency: 'INR',
      },
    ];

    for (const account of systemAccounts) {
      const existingAccount = await this.accountRepository.findOne({
        where: {
          merchantId: IsNull(),
          code: account.code,
        },
      });

      if (!existingAccount) {
        await this.accountRepository.save(
          this.accountRepository.create({
            merchantId: null,
            name: account.name,
            code: account.code,
            type: account.type,
            currency: account.currency,
            status: LedgerAccountStatus.ACTIVE,
          }),
        );
      }
    }
  }

  async getSystemAccountByCode(
    code: string,
    manager?: EntityManager,
  ): Promise<LedgerAccount> {
    const repository = manager
      ? manager.getRepository(LedgerAccount)
      : this.accountRepository;

    const account = await repository.findOne({
      where: {
        merchantId: IsNull(),
        code,
        status: LedgerAccountStatus.ACTIVE,
      },
    });

    if (!account) {
      throw new NotFoundException(`System ledger account ${code} not found`);
    }

    return account;
  }

  async postJournal(
    input: PostJournalInput,
    transactionManager?: EntityManager,
  ): Promise<PostJournalResult> {
    const { merchantId, referenceType, referenceId, currency, entries } = input;

    if (!entries || entries.length < 2) {
      throw new BadRequestException(
        'A journal must contain at least two entries',
      );
    }

    const debitEntries = entries.filter(
      (entry) => entry.type === LedgerEntryType.DEBIT,
    );

    const creditEntries = entries.filter(
      (entry) => entry.type === LedgerEntryType.CREDIT,
    );

    if (debitEntries.length === 0 || creditEntries.length === 0) {
      throw new BadRequestException(
        'A journal must contain both debit and credit entries',
      );
    }

    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const entry of entries) {
      if (!/^[1-9]\d*$/.test(entry.amount)) {
        throw new BadRequestException(
          'Entry amounts must be positive integer values in paise',
        );
      }

      const amount = BigInt(entry.amount);

      if (entry.type === LedgerEntryType.DEBIT) {
        totalDebits += amount;
      } else if (entry.type === LedgerEntryType.CREDIT) {
        totalCredits += amount;
      } else {
        throw new BadRequestException('Invalid ledger entry type');
      }
    }

    if (totalDebits !== totalCredits) {
      throw new BadRequestException('Total debits must equal total credits');
    }

    const accountIds = [...new Set(entries.map((entry) => entry.accountId))];

    const execute = async (
      manager: EntityManager,
    ): Promise<PostJournalResult> => {
      const accountRepository = manager.getRepository(LedgerAccount);

      const entryRepository = manager.getRepository(LedgerEntry);

      const journalRepository = manager.getRepository(LedgerJournal);

      const accounts = await accountRepository.find({
        where: {
          id: In(accountIds),
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (accounts.length !== accountIds.length) {
        throw new NotFoundException(
          'One or more ledger accounts were not found',
        );
      }

      for (const account of accounts) {
        if (account.status !== LedgerAccountStatus.ACTIVE) {
          throw new ConflictException(
            `Ledger account ${account.code} is inactive`,
          );
        }

        if (account.currency !== currency) {
          throw new BadRequestException(
            `Currency mismatch for ledger account ${account.code}`,
          );
        }

        if (account.merchantId !== null && account.merchantId !== merchantId) {
          throw new ConflictException(
            'Ledger account does not belong to this merchant',
          );
        }
      }

      const journal = journalRepository.create({
        merchantId,
        referenceType,
        referenceId,
        currency,
        totalDebits: totalDebits.toString(),
        totalCredits: totalCredits.toString(),
        description: input.description ?? null,
        status: LedgerJournalStatus.POSTED,
        reversalOfId: null,
      });

      const savedJournal = await journalRepository.save(journal);

      const ledgerEntries = entries.map((entry) =>
        entryRepository.create({
          journalId: savedJournal.id,
          accountId: entry.accountId,
          type: entry.type,
          amount: entry.amount,
          currency,
          referenceType,
          referenceId,
          description: entry.description ?? input.description ?? null,
        }),
      );

      await entryRepository.save(ledgerEntries);

      return {
        journal: savedJournal,
        entries: ledgerEntries,
      };
    };

    try {
      if (transactionManager) {
        return await execute(transactionManager);
      }

      return await this.dataSource.transaction(execute);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error as QueryFailedError & {
            driverError?: { code?: string };
          }
        ).driverError?.code === '23505'
      ) {
        throw new ConflictException(
          'A ledger journal already exists for this reference',
        );
      }

      throw error;
    }
  }

  async getAccountBalance(accountId: string, merchantId: string) {
    const account = await this.accountRepository.findOne({
      where: {
        id: accountId,
      },
    });

    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    if (account.merchantId !== null && account.merchantId !== merchantId) {
      throw new ConflictException(
        'Ledger account does not belong to this merchant',
      );
    }

    const result = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoin('entry.journal', 'journal')
      .select(
        `
        COALESCE(
          SUM(
            CASE
              WHEN entry.type = :debit
                THEN CAST(entry.amount AS NUMERIC)
              WHEN entry.type = :credit
                THEN -CAST(entry.amount AS NUMERIC)
              ELSE 0
            END
          ),
          0
        )
        `,
        'balance',
      )
      .where('entry.accountId = :accountId', {
        accountId,
      })
      .andWhere('journal.merchantId = :merchantId', {
        merchantId,
      })
      .setParameters({
        debit: LedgerEntryType.DEBIT,
        credit: LedgerEntryType.CREDIT,
      })
      .getRawOne<{ balance: string }>();

    return {
      accountId: account.id,
      accountName: account.name,
      accountCode: account.code,
      accountType: account.type,
      currency: account.currency,
      balance: result?.balance ?? '0',
    };
  }

  async getAccountStatement(
    accountId: string,
    merchantId: string,
    from?: string,
    to?: string,
  ) {
    const account = await this.accountRepository.findOne({
      where: {
        id: accountId,
      },
    });

    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    if (account.merchantId !== null && account.merchantId !== merchantId) {
      throw new ConflictException(
        'Ledger account does not belong to this merchant',
      );
    }

    const parseDate = (value: string, field: string): Date => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
      }

      const parsed = new Date(`${value}T00:00:00.000Z`);

      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      ) {
        throw new BadRequestException(`${field} is not a valid date`);
      }

      return parsed;
    };

    const fromDate = from ? parseDate(from, 'from') : undefined;

    const toDate = to ? parseDate(to, 'to') : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException(
        'The from date cannot be after the to date',
      );
    }

    const toExclusive = toDate
      ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000)
      : undefined;

    const query = this.entryRepository
      .createQueryBuilder('entry')
      .innerJoin('entry.journal', 'journal')
      .where('entry.accountId = :accountId', {
        accountId,
      })
      .andWhere('journal.merchantId = :merchantId', {
        merchantId,
      });

    if (toExclusive) {
      query.andWhere('entry.createdAt < :toExclusive', {
        toExclusive,
      });
    }

    const allEntries = await query
      .orderBy('entry.createdAt', 'ASC')
      .addOrderBy('entry.id', 'ASC')
      .getMany();

    let openingBalance = 0n;
    let periodBalance = 0n;

    const statementEntries = [];

    for (const entry of allEntries) {
      const amount = BigInt(entry.amount);

      const signedAmount =
        entry.type === LedgerEntryType.DEBIT ? amount : -amount;

      if (fromDate && entry.createdAt < fromDate) {
        openingBalance += signedAmount;
        continue;
      }

      periodBalance += signedAmount;

      statementEntries.push({
        id: entry.id,
        journalId: entry.journalId,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        type: entry.type,
        amount: entry.amount,
        currency: entry.currency,
        description: entry.description,
        createdAt: entry.createdAt,
        runningBalance: (openingBalance + periodBalance).toString(),
      });
    }

    return {
      account: {
        id: account.id,
        name: account.name,
        code: account.code,
        type: account.type,
        currency: account.currency,
      },
      period: {
        from: from ?? null,
        to: to ?? null,
      },
      openingBalance: openingBalance.toString(),
      entries: statementEntries,
      closingBalance: (openingBalance + periodBalance).toString(),
    };
  }

  async findAllAccounts(merchantId: string, page = 1, limit = 10) {
    const [accounts, total] = await this.accountRepository
      .createQueryBuilder('account')
      .where(
        '(account.merchantId = :merchantId OR account.merchantId IS NULL)',
        { merchantId },
      )
      .orderBy('account.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: accounts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllJournals(
    merchantId: string,
    page = 1,
    limit = 10,
    filters?: LedgerJournalFilterDto,
  ) {
    const query = this.journalRepository
      .createQueryBuilder('journal')
      .leftJoinAndSelect('journal.entries', 'entry')
      .leftJoinAndSelect('entry.account', 'account')
      .where('journal.merchantId = :merchantId', {
        merchantId,
      });

    if (filters?.referenceType) {
      query.andWhere('journal.referenceType = :referenceType', {
        referenceType: filters.referenceType,
      });
    }

    if (filters?.status) {
      query.andWhere('journal.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.from) {
      query.andWhere('journal.createdAt >= :from', {
        from: new Date(filters.from),
      });
    }

    if (filters?.to) {
      const toExclusive = new Date(filters.to);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

      query.andWhere('journal.createdAt < :toExclusive', { toExclusive });
    }

    const [journals, total] = await query
      .orderBy('journal.createdAt', 'DESC')
      .addOrderBy('entry.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: journals,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async reverseJournal(journalId: string, merchantId: string) {
    return this.dataSource.transaction(async (manager) => {
      const journalRepository = manager.getRepository(LedgerJournal);

      const entryRepository = manager.getRepository(LedgerEntry);

      const originalJournal = await journalRepository
        .createQueryBuilder('journal')
        .setLock('pessimistic_write')
        .where('journal.id = :journalId', {
          journalId,
        })
        .andWhere('journal.merchantId = :merchantId', {
          merchantId,
        })
        .getOne();

      if (!originalJournal) {
        throw new NotFoundException('Ledger journal not found');
      }

      if (originalJournal.status !== LedgerJournalStatus.POSTED) {
        throw new ConflictException('Only posted journals can be reversed');
      }

      const existingReversal = await journalRepository.findOne({
        where: {
          reversalOfId: originalJournal.id,
        },
      });

      if (existingReversal) {
        throw new ConflictException('This journal has already been reversed');
      }

      const originalEntries = await entryRepository.find({
        where: {
          journalId: originalJournal.id,
        },
      });

      if (originalEntries.length < 2) {
        throw new ConflictException('Original journal has invalid entries');
      }

      const reversalJournal = journalRepository.create({
        merchantId: originalJournal.merchantId,
        referenceType: 'REVERSAL',
        referenceId: originalJournal.id,
        currency: originalJournal.currency,
        totalDebits: originalJournal.totalCredits,
        totalCredits: originalJournal.totalDebits,
        description: `Reversal of journal ${originalJournal.id}`,
        status: LedgerJournalStatus.POSTED,
        reversalOfId: originalJournal.id,
      });

      const savedReversal = await journalRepository.save(reversalJournal);

      const reversalEntries = originalEntries.map((entry) =>
        entryRepository.create({
          journalId: savedReversal.id,
          accountId: entry.accountId,
          type:
            entry.type === LedgerEntryType.DEBIT
              ? LedgerEntryType.CREDIT
              : LedgerEntryType.DEBIT,
          amount: entry.amount,
          currency: entry.currency,
          referenceType: 'REVERSAL',
          referenceId: originalJournal.id,
          description: `Reversal of entry ${entry.id}`,
        }),
      );

      await entryRepository.save(reversalEntries);

      originalJournal.status = LedgerJournalStatus.REVERSED;

      await journalRepository.save(originalJournal);

      return {
        originalJournal,
        reversalJournal: savedReversal,
        entries: reversalEntries,
      };
    });
  }
  async getJournalById(journalId: string, merchantId: string) {
    const journal = await this.journalRepository.findOne({
      where: {
        id: journalId,
        merchantId,
      },
      relations: {
        entries: {
          account: true,
        },
      },
    });

    if (!journal) {
      throw new NotFoundException('Ledger journal not found');
    }

    return journal;
  }

  async updateAccountStatus(
    accountId: string,
    merchantId: string,
    status: LedgerAccountStatus,
  ) {
    const account = await this.accountRepository.findOne({
      where: {
        id: accountId,
        merchantId,
      },
    });

    if (!account) {
      throw new NotFoundException('Merchant ledger account not found');
    }

    if (account.status === status) {
      throw new ConflictException(`Ledger account is already ${status}`);
    }

    account.status = status;

    return this.accountRepository.save(account);
  }
  async deactivateAccount(accountId: string, merchantId: string) {
    const account = await this.accountRepository.findOne({
      where: {
        id: accountId,
        merchantId,
      },
    });

    if (!account) {
      throw new NotFoundException('Merchant ledger account not found');
    }

    if (account.status === LedgerAccountStatus.INACTIVE) {
      throw new ConflictException('Ledger account is already inactive');
    }

    account.status = LedgerAccountStatus.INACTIVE;

    return this.accountRepository.save(account);
  }
}
