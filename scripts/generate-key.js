#!/usr/bin/env node

/**
 * TutorMate 라이선스 키 생성 스크립트
 *
 * 사용법:
 *   node scripts/generate-key.js                       # 키 생성 (basic)
 *   node scripts/generate-key.js --memo "홍길동 학원"   # 메모 추가
 *   node scripts/generate-key.js --plan premium        # 플랜 지정
 *   node scripts/generate-key.js --list                # 등록된 키 목록 조회
 *
 * 환경변수 (필수):
 *   SUPABASE_URL          - Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_KEY  - Supabase service_role 키
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LICENSES_FILE = join(__dirname, 'licenses.json');
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// 환경변수 로드 (scripts/.env.admin)
const adminEnvPath = join(__dirname, '.env.admin');
if (existsSync(adminEnvPath)) {
  const envContent = readFileSync(adminEnvPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function generateGroup() {
  let group = '';
  for (let i = 0; i < 4; i++) {
    group += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return group;
}

function generateKey() {
  return `TMKH-${generateGroup()}-${generateGroup()}-${generateGroup()}`;
}

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

function loadLicenses() {
  if (existsSync(LICENSES_FILE)) {
    return JSON.parse(readFileSync(LICENSES_FILE, 'utf-8'));
  }
  return [];
}

function saveLicenses(licenses) {
  writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2), 'utf-8');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { memo: null, plan: 'basic', list: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--memo' && args[i + 1]) {
      result.memo = args[++i];
    } else if (args[i] === '--plan' && args[i + 1]) {
      result.plan = args[++i];
    } else if (args[i] === '--list') {
      result.list = true;
    }
  }

  return result;
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=minimal',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase API error (${response.status}): ${text}`);
  }

  if (options.prefer === 'return=representation' || options.method === 'GET' || !options.method) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return null;
}

async function listKeys() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_URL과 SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  const rows = await supabaseRequest('license_keys?select=key,plan,memo,created_at&order=created_at.desc');
  if (!rows || rows.length === 0) {
    console.log('등록된 키가 없습니다.');
    return;
  }

  console.log(`\n=== 등록된 라이선스 키 (${rows.length}개) ===\n`);
  console.log('키                    | 플랜    | 메모               | 생성일');
  console.log('-'.repeat(75));

  for (const row of rows) {
    const key = (row.key || '(해시만 저장됨)').padEnd(21);
    const plan = row.plan.padEnd(7);
    const memo = (row.memo || '-').padEnd(18);
    const date = row.created_at.split('T')[0];
    console.log(`${key} | ${plan} | ${memo} | ${date}`);
  }

  // 로컬 licenses.json에 원본 키가 있으면 함께 표시
  const localLicenses = loadLicenses();
  if (localLicenses.length > 0) {
    console.log(`\n=== 로컬 키 기록 (scripts/licenses.json, ${localLicenses.length}개) ===\n`);
    for (const l of localLicenses) {
      console.log(`${l.key}  ${l.memo || '-'}  ${l.createdAt}`);
    }
  }
}

async function main() {
  const args = parseArgs();

  if (args.list) {
    await listKeys();
    return;
  }

  // 키 생성
  const key = generateKey();
  const hash = sha256(key);
  const createdAt = new Date().toISOString().split('T')[0];

  // 로컬 licenses.json에 저장 (원본 키 보관)
  const licenses = loadLicenses();
  licenses.push({ key, hash, memo: args.memo, createdAt });
  saveLicenses(licenses);

  // Supabase에 해시 등록
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      await supabaseRequest('license_keys', {
        method: 'POST',
        body: JSON.stringify({
          key_hash: hash,
          key,
          plan: args.plan,
          memo: args.memo,
        }),
      });
      console.log('\n=== TutorMate 라이선스 키 생성 완료 ===\n');
      console.log(`키 (사용자에게 전달): ${key}`);
      console.log(`플랜: ${args.plan}`);
      if (args.memo) console.log(`메모: ${args.memo}`);
      console.log(`생성일: ${createdAt}`);
      console.log('\nSupabase license_keys 테이블에 등록 완료');
    } catch (error) {
      console.error(`\nSupabase 등록 실패: ${error.message}`);
      console.log('\n키는 로컬(scripts/licenses.json)에 저장되었습니다.');
      console.log(`해시: ${hash}`);
      console.log('수동으로 Supabase Dashboard에서 license_keys에 추가하세요.');
    }
  } else {
    console.log('\n=== TutorMate 라이선스 키 생성 완료 ===\n');
    console.log(`키 (사용자에게 전달): ${key}`);
    console.log(`해시: ${hash}`);
    console.log(`플랜: ${args.plan}`);
    if (args.memo) console.log(`메모: ${args.memo}`);
    console.log(`생성일: ${createdAt}`);
    console.log('\n⚠ SUPABASE_URL / SUPABASE_SERVICE_KEY가 없어 로컬에만 저장됨');
    console.log('Supabase Dashboard에서 license_keys 테이블에 수동으로 추가하세요:');
    console.log(JSON.stringify({ key_hash: hash, plan: args.plan, memo: args.memo }, null, 2));
  }

  console.log(`\nscripts/licenses.json에 원본 키가 저장되었습니다.`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
