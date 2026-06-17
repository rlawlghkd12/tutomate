// 모든 샘플 엑셀에 대해 parseExcelHeaders → mapColumns → previewImport 검증.
// LLM 없이 도구만 직접 호출.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDispatcher } from '@tutomate/core';
import { createFileStash } from '@tutomate/electron-shared/src/ai/FileStash';
import { MOCK_TOOLS } from '../mockTools.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.resolve(__dirname, '..', 'samples');
const STASH_DIR = path.resolve(__dirname, '..', '.data', 'stash-test');
fs.rmSync(STASH_DIR, { recursive: true, force: true });
fs.mkdirSync(STASH_DIR, { recursive: true });

const fileStash = createFileStash({ baseDir: STASH_DIR });
const dispatcher = createDispatcher(MOCK_TOOLS as any);

function bar(c: string, n = 70) {
  return c.repeat(n);
}

async function testFile(filename: string) {
  console.log('\n' + bar('═'));
  console.log(`📄 ${filename}`);
  console.log(bar('═'));

  const buf = fs.readFileSync(path.join(SAMPLES_DIR, filename));
  const { fileId } = await fileStash.save(buf);

  const ctx: any = {
    orgId: 'test', userId: 'test', fileStash,
    cards: [] as unknown[],
    emit(card: unknown) { this.cards.push(card); },
  };

  // 1. parseExcelHeaders
  const parsed = (await dispatcher.dispatch('parseExcelHeaders', { fileId }, ctx)) as any;
  if (parsed.error) {
    console.log(`  ❌ parseExcelHeaders 실패: ${parsed.error.message}`);
    return;
  }
  console.log(`\n  📋 헤더 (${parsed.headers.length}개): ${parsed.headers.join(', ')}`);
  console.log(`  📊 총 행 수: ${parsed.totalRows}`);
  console.log(`  🔍 샘플 1행:`, JSON.stringify(parsed.sample[0] ?? {}));

  // 2. mapColumns
  const mapping = (await dispatcher.dispatch('mapColumns', { headers: parsed.headers }, ctx)) as any;
  if (mapping.error) {
    console.log(`  ❌ mapColumns 실패: ${mapping.error.message}`);
    return;
  }
  if (mapping.status === 'mismatch') {
    console.log(`\n  ⚠️  매핑 실패 (rejected by design)`);
    console.log(`     ✓ 매칭됨: ${mapping.matched.join(', ')}`);
    console.log(`     ✗ 매칭 실패: ${mapping.unmatched.join(', ')}`);
    return;
  }

  console.log(`\n  ✅ 매핑 성공 (cacheHit=${mapping.cacheHit})`);
  for (const [col, field] of Object.entries(mapping.mapping)) {
    console.log(`     ${col.padEnd(20)} → ${field}`);
  }

  // 3. previewImport
  // students vs payments 자동 판별
  const fields = Object.values(mapping.mapping);
  const kind = fields.includes('paymentDate') || fields.includes('amount') ? 'payments' : 'students';
  console.log(`\n  📥 previewImport (kind=${kind})`);
  const preview = (await dispatcher.dispatch('previewImport', {
    fileId, mapping: mapping.mapping, kind,
  }, ctx)) as any;
  if (preview.error) {
    console.log(`     ❌ ${preview.error.message}`);
    return;
  }
  console.log(`     총 ${preview.total}행 / 정규화 실패 ${preview.errorRows}행`);

  // 카드에서 실제 미리보기 행들 출력
  const previewCard = (ctx.cards as any[]).find((c) => c?.type === 'importPreview');
  if (previewCard) {
    console.log(`     미리보기 첫 3행:`);
    for (const row of previewCard.rows.slice(0, 3)) {
      const dataStr = Object.entries(row.data).map(([k, v]) => `${k}=${v}`).join(' | ');
      const errStr = row.errors.length > 0 ? ` ⚠️ 에러: [${row.errors.join(',')}]` : '';
      console.log(`       · ${dataStr}${errStr}`);
    }
    // 정규화 실패 행 별도 출력
    const errorRows = previewCard.rows.filter((r: any) => r.errors.length > 0);
    if (errorRows.length > 0) {
      console.log(`     ⚠️  정규화 실패 행 ${errorRows.length}개:`);
      for (const row of errorRows.slice(0, 5)) {
        console.log(`       · 원본:`, JSON.stringify(row.data), `에러:`, row.errors);
      }
    }
  }
}

async function main() {
  const files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.xlsx')).sort();
  console.log(`샘플 파일 ${files.length}개 검증 시작`);
  for (const f of files) {
    try {
      await testFile(f);
    } catch (e: any) {
      console.log(`  💥 예외: ${e.message}`);
    }
  }
  console.log('\n' + bar('═'));
  console.log('완료');
  console.log(bar('═'));
}

main().catch((e) => { console.error(e); process.exit(1); });
