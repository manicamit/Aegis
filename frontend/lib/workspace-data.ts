import type { FatfRule } from '@/types/aegis';

export interface WorkspaceCase {
  id: string;
  masked: string;
  bank: string;
  assigned: string;
  status: string;
  score: number;
  totalMoved: number;
  txCount: number;
  dateRange: string;
  fatfRules: FatfRule[];
}
