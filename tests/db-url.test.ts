import { describe, expect, it } from 'vitest';
import { toTransactionPooler } from '@/lib/db';

describe('Supabase pooler URL', () => {
  it('moves the session pooler to the transaction pooler', () => {
    expect(toTransactionPooler('postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres')).toBe(
      'postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
    );
  });
  it('leaves other databases and ports alone', () => {
    expect(toTransactionPooler('postgresql://u:p@db.example.com:5432/app')).toBe('postgresql://u:p@db.example.com:5432/app');
    expect(toTransactionPooler('postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres')).toBe('postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres');
  });
});
