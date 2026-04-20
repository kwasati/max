# 16-exit-decision-template.md — Karl's Exit Decision Template

> **Rules in force:** [00-research-rules.md](00-research-rules.md)
>
> **Reference:** [15-exit-rules.md](15-exit-rules.md) (5 sell rules + 3 don't-sell rules)
>
> **Purpose:** ให้ Karl กรอกทุกครั้งก่อนตัดสินใจขายหุ้น — บังคับ check ทั้ง 8 rules ก่อนกด. ห้าม copy-paste, ต้องกรอกใหม่ทุกตัว

---

## Template (กรอกตัวนี้ทุกครั้ง)

```markdown
# Exit Decision — {SYMBOL}

## Position Info
- Entry date: {YYYY-MM-DD}
- Entry price: ฿{price}
- Current price: ฿{price}
- Holding period: {X.Y} years
- Position size (% of portfolio): {N}%
- Unrealized P&L: {+/- %}

## Trigger Source (เลือก ≥1)
- [ ] Filter degradation (เคยผ่าน 5-5-5-5 → fail ตอนนี้)
- [ ] Valuation bubble (P/E > 3x baseline)
- [ ] Thesis change (business model / moat เปลี่ยน)
- [ ] Macro structural (Structural Risk Score > 70)
- [ ] Personal capital need (liquidity event)
- [ ] Better opportunity (rotate ไปตัวอื่น)

## Niwes Rules Check (8 rules จาก 15-exit-rules.md)

### Sell Rules (5) — ต้องมี ≥1 TRIGGERED จึงจะขาย
- Rule 1 (Thesis change): TRIGGERED / NOT — note: {reason}
- Rule 2 (Filter degradation): TRIGGERED / NOT — note: {which field fails}
- Rule 3 (Valuation bubble): TRIGGERED / NOT — note: {PE baseline vs current}
- Rule 4 (Better opportunity): TRIGGERED / NOT — note: {what's the replacement}
- Rule 5 (Capital need): TRIGGERED / NOT — note: {amount needed}

### Don't-Sell Rules (3) — ถ้า ≥1 TRIGGERED ต้องอธิบายทำไมยังขาย
- Anti-Rule 1 (Short-term price drop <30%, thesis intact): TRIGGERED / NOT — note: {price drop %}
- Anti-Rule 2 (Sector rotation noise): TRIGGERED / NOT — note: {sector sentiment vs business fundamentals}
- Anti-Rule 3 (Macro fear not hitting business): TRIGGERED / NOT — note: {is revenue/earning actually affected?}

## Decision
{Reasoning paragraph — 3-5 บรรทัด อธิบายว่าทำไมขาย (หรือไม่ขาย). ต้องระบุ rule ที่ใช้ + counter-check กับ don't-sell rules ชัดเจน. ห้ามอ้าง "รู้สึก"}

## Action
- [ ] Full sell ({shares_all})
- [ ] Partial sell ({N}% = {shares})
- [ ] Hold (กลับมา review ภายใน {X} เดือน)

## Post-decision log
- Sell date (if executed): {YYYY-MM-DD}
- Sell price: ฿{price}
- Realized P&L: {+/- %}
- Rotate into: {SYMBOL or CASH}
- Review note: {what I learned from this trade}
```

---

## Example 1 — OR Case (ดร.นิเวศน์ exit, 2021–2022)

> Note: ตัวเลข OR ใน example นี้ตาม popular VI memory — ตัวเลข primary source ยังไม่ verify ครบ (ดู [09-case-or-exit.md](09-case-or-exit.md) ข้อ [VERIFY]). Example นี้ demonstrate format เท่านั้น

```markdown
# Exit Decision — OR.BK

## Position Info
- Entry date: 2021-02-11 (IPO)
- Entry price: ฿18.00 (IPO)
- Current price: ฿22.50 (avg sell price ~2022)
- Holding period: ~1.0 year
- Position size (% of portfolio): ~8% (est.)
- Unrealized P&L: +25% (before dividend)

## Trigger Source
- [x] Thesis change — EV disruption + retail margin compression
- [x] Better opportunity — rotate into US/Vietnam (2024 rebalance)
- [ ] Filter degradation
- [ ] Valuation bubble
- [ ] Macro structural
- [ ] Personal capital need

## Niwes Rules Check

### Sell Rules (5)
- Rule 1 (Thesis change): **TRIGGERED** — note: ธุรกิจน้ำมัน disrupt จาก EV (ไม่ใช่ตำแหน่งชั่วคราว, secular trend) + retail margin ของ 7-Eleven inside ปตท. ไม่เหมือนกับ CPALL ดั้งเดิม
- Rule 2 (Filter degradation): NOT — OR ไม่เคยผ่าน 5-5-5-5 ในความเข้มของเกณฑ์ (dividend streak < 5 เพราะ IPO 2021)
- Rule 3 (Valuation bubble): NOT — ราคา IPO → peak ~28฿, ไม่ใช่ bubble ขนาด 3x
- Rule 4 (Better opportunity): **TRIGGERED** — ดร.นิเวศน์ rotate 35% ของพอร์ตไทย (65→30%) ไป US + VN, OR อยู่ในกลุ่มที่ขายก่อน
- Rule 5 (Capital need): NOT — ไม่ใช่เหตุผล personal

### Don't-Sell Rules (3)
- Anti-Rule 1 (Short-term price drop <30%, thesis intact): NOT — ตรงข้าม, ขายตอน gain +25%, thesis เปลี่ยน
- Anti-Rule 2 (Sector rotation noise): NOT — energy sector disrupt secular ไม่ใช่ cyclical noise
- Anti-Rule 3 (Macro fear not hitting business): NOT — macro fear (EV) กระทบ OR business directly

## Decision

Sell ทั้งหมด. Thesis ที่ซื้อตอน IPO (PTT brand + retail network) เปลี่ยน — EV เป็น secular disruption ที่กระทบ fuel margin 5-10 ปีข้างหน้า, ไม่ใช่ cyclical. ประกอบกับ ดร.นิเวศน์ เห็น risk/reward ดีกว่าใน US mega-cap + Vietnam growth — capital ที่ถอนออกมีที่ไป. Counter-check: ไม่มี don't-sell rule trigger (ไม่ใช่ noise ระยะสั้น, macro fear กระทบจริง).

## Action
- [x] Full sell
- [ ] Partial sell
- [ ] Hold

## Post-decision log
- Sell date: 2022-03 (est., range 2021-09 ถึง 2022-03)
- Sell price: ฿22.50 avg (ประมาณการจาก VI community talk)
- Realized P&L: +25% (ก่อน div)
- Rotate into: US index + Vietnam (FPT) — ตาม 12-recent-views-2025-2026.md
- Review note: **ขาย VI ทำได้แม้กำไร ถ้า thesis เปลี่ยน** — ไม่ใช่ hold ตลอดชีวิตเป็นกฎเหล็ก. Disruption risk ต้องประเมิน upfront จะได้ไม่โดนล็อคในธุรกิจที่กำลังถูก obsolete
```

---

## Usage Flow

การใช้ template นี้:

1. เปิดจากหน้า stock detail (dashboard) → กดปุ่ม "Exit Check" → API `/api/exit_check/{symbol}` return triggers + structural risk score
2. Copy template ด้านบน → paste ลง `reports/exit_{SYMBOL}_{date}.md`
3. กรอกทีละ field — อย่าข้ามแม้ไม่เกี่ยว (เขียน "NOT" + note สั้น ๆ ก็พอ)
4. อ่านทั้งไฟล์ 1 รอบก่อนกดขาย
5. หลังขายจริง → update Post-decision log

**Friction เป็น feature ของ template นี้** — ถ้ารู้สึกยุ่ง แสดงว่ากำลังจะขายตามอารมณ์ ให้หยุด
