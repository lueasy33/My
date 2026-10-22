// Проверка: ни один вопрос квиза не получает дистракторы из чужого бренда.
const B = process.env.TEST_BASE || 'http://localhost:8090'
const j = await fetch(B + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: '+79103334455', password: 'aladdin2026' })
})
const ck = j.headers.get('set-cookie').split(';')[0]

let bad = 0
let total = 0
for (let i = 0; i < 15; i++) {
  const s = await (await fetch(B + '/api/flavors/session?size=10', { headers: { cookie: ck } })).json()
  for (const it of s.items) {
    total++
    if (!it.options.every(o => o.brand === it.brand)) {
      bad++
      console.log('ЧУЖОЙ БРЕНД:', it.brand, '←', it.options.map(o => o.brand).join(', '))
    }
  }
}
console.log(`вопросов проверено: ${total}, с чужим брендом: ${bad}`)
process.exit(bad ? 1 : 0)
