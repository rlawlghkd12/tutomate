#!/usr/bin/env node

/**
 * TutorMate 라이선스 키 생성 스크립트
 *
 * 사용법: node scripts/generate-key.js
 *
 * - TMKH-XXXX-XXXX-XXXX 형식의 키 생성
 * - SHA-256 해시 계산
 * - scripts/licenses.json에 원본 키+해시+생성일 저장
 * - Gist에 올릴 해시 목록 출력
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LICENSES_FILE = join(__dirname, 'licenses.json');
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

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

// 키 생성
const key = generateKey();
const hash = sha256(key);
const createdAt = new Date().toISOString().split('T')[0];

// licenses.json에 저장
const licenses = loadLicenses();
licenses.push({ key, hash, createdAt });
saveLicenses(licenses);

// 결과 출력
console.log('=== TutorMate 라이선스 키 생성 완료 ===\n');
console.log(`키 (사용자에게 전달): ${key}`);
console.log(`해시 (Gist에 추가):   ${hash}`);
console.log(`생성일: ${createdAt}`);
console.log(`\nscripts/licenses.json에 저장되었습니다.`);

// Gist용 해시 목록 출력
const allHashes = licenses.map((l) => l.hash);
console.log('\n=== Gist hashes 배열 (복사하여 Gist에 붙여넣기) ===\n');
console.log(JSON.stringify({ hashes: allHashes }, null, 2));
