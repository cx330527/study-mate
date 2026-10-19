import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerAccess } from '../lib/ai-access.mjs';

test('匿名访客不能调用站主 AI', () => {
  assert.equal(ownerAccess(null, 'owner@example.test').status, 401);
});
test('已登录的其他访客也不能使用私人额度，不能从响应获知站主邮箱', () => {
  const response = ownerAccess({ email: 'visitor@example.test' }, 'owner@example.test');
  assert.equal(response.allowed, false); assert.equal(response.status, 403);
  assert.equal(JSON.stringify(response).includes('owner@example.test'), false);
});
test('站主可以使用 AI，配置缺失时安全拒绝', () => {
  assert.equal(ownerAccess({ email: 'Owner@Example.test' }, 'owner@example.test').allowed, true);
  assert.equal(ownerAccess({ email: 'owner@example.test' }, '').allowed, false);
  assert.equal(ownerAccess({ email: 'owner@example.test' }, undefined).allowed, false);
});
