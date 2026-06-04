import type Database from 'better-sqlite3';
import { createSettingsRepository, type SettingsRepository } from './settings.repository';
import { createCategoryRepository, type CategoryRepository } from './category.repository';
import { createTemplateRepository, type TemplateRepository } from './template.repository';
import { createMonthlyAmountRepository, type MonthlyAmountRepository } from './monthlyAmount.repository';
import { createMonthlyActualRepository, type MonthlyActualRepository } from './monthlyActual.repository';
import { createSnapshotRepository, type SnapshotRepository } from './snapshot.repository';

export interface Repositories {
  settings: SettingsRepository;
  category: CategoryRepository;
  template: TemplateRepository;
  monthlyAmount: MonthlyAmountRepository;
  monthlyActual: MonthlyActualRepository;
  snapshot: SnapshotRepository;
}

// The DI seam: one bundle of repositories over a single db handle.
export function createRepositories(db: Database.Database): Repositories {
  return {
    settings: createSettingsRepository(db),
    category: createCategoryRepository(db),
    template: createTemplateRepository(db),
    monthlyAmount: createMonthlyAmountRepository(db),
    monthlyActual: createMonthlyActualRepository(db),
    snapshot: createSnapshotRepository(db),
  };
}
