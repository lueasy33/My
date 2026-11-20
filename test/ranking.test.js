// Рейтинг: главная, профиль и страница рейтинга показывают одно место за один период.
// Журнал админки: подписи безличные, без рода («Сотрудник создан»).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from './helpers.js'

let S
before(async () => { S = await startServer() })
after(() => S?.stop())

test('место на главной и в профиле совпадает со страницей рейтинга, период подписан', async () => {
  for (const phone of ['+79103334455', '+79102223344', '+79106667788']) {
    const { cookie } = await S.login(phone)
    for (const period of [undefined, 'week', 'month', 'all']) {
      const q = period ? `?period=${period}` : ''
      const expect = period || 'month'
      const page = await S.call(`/api/ranking?scope=company${q.replace("?", "&")}`, { cookie })
      const branch = await S.call(`/api/ranking?scope=branch${q.replace("?", "&")}`, { cookie })
      const dash = await S.call(`/api/dashboard${q}`, { cookie })
      const prof = await S.call(`/api/profile${q}`, { cookie })
      assert.equal(page.json.period, expect)
      for (const [name, r] of [['главная', dash.json.rank], ['профиль', prof.json.rank]]) {
        assert.equal(r.period, expect, `${name}: нет периода`)
        assert.equal(r.company, page.json.me.rank, `${phone} ${expect}: ${name} ${r.company}, рейтинг ${page.json.me.rank}`)
        assert.equal(r.companyTotal, page.json.total)
        assert.equal(r.branch, branch.json.me.rank, `${name}: место в филиале`)
        assert.equal(r.branchTotal, branch.json.total)
      }
    }
  }
})

test('у админа места в рейтинге нет', async () => {
  const { cookie } = await S.login('+79101234567')
  assert.equal((await S.call('/api/dashboard', { cookie })).json.rank, null)
})

test('журнал админки — безличные подписи', async () => {
  const { cookie } = await S.login('+79101234567')
  const branch_id = S.db.prepare('SELECT MIN(id) id FROM branches').get().id
  const r = await S.call('/api/admin/users', { cookie, method: 'POST', body: { name: 'Проверка Журнала', phone: '+79990000201', password: 'zhurnal-2026', role: 'employee', branch_id } })
  assert.equal(r.status, 200, r.text)
  const log = await S.call('/api/admin/audit', { cookie })
  const row = log.json.items.find(i => i.action === 'user.create')
  assert.equal(row.title, 'Сотрудник создан')
  assert.equal(row.actor, 'Марина Соколова')
  const ov = await S.call('/api/admin/overview', { cookie })
  if (ov.status === 200 && ov.json.recentLog) assert.ok(ov.json.recentLog.every(i => typeof i.title === 'string' && i.title))
  for (const i of log.json.items) assert.doesNotMatch(i.title, /(создал|отправил|изменил)\b/)
})
