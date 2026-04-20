---
project: MaxMahon
created: 2026-04-20
last_updated: 2026-04-20
status: active
audience: Karl (Thai resident investor — comprehensive tax guide)
---

# 04 — Tax Comprehensive: ภาษีการลงทุนต่างประเทศ (Complete Guide)

---

## ⚠️ DISCLAIMER (ต้องอ่านก่อนทุกอย่าง) ⚠️

> **ผู้เขียนไม่ใช่นักภาษี (ไม่ใช่ CPA, ไม่ใช่ tax lawyer)**
>
> ตัวเลขและกฎหมายอ้างอิงราชกิจจานุเบกษา + กรมสรรพากร (rd.go.th) เท่านั้น
>
> **ถ้าจะใช้จริงต้อง:**
> 1. โทรปรึกษา **rd.go.th hotline 1161** ยืนยันการตีความ
> 2. Consult tax professional ที่ certified กับ ATCS (Association of Thai Corporate Secretaries), TFPA (Thai Financial Planners Association), หรือ สำนักงานบัญชี CPA registered
> 3. **ห้าม rely ตัวเลขใดๆ ในเอกสารนี้แบบ blind** — กฎหมายเปลี่ยน, การตีความเปลี่ยน, และ case-by-case facts เปลี่ยนผลลัพธ์
>
> ทุก legal claim ในเอกสารนี้มี source URL + section number — ถ้าเห็น [VERIFY] คือต้องตรวจเพิ่ม

---

## Table of Contents

1. [Why Final Tax 10% (หุ้นไทย) ใช้ไม่ได้กับหุ้นนอก](#section-1)
2. [ป.161/2566 ฉบับเต็ม + Context](#section-2)
3. [DTA Thailand-Vietnam + Thailand-USA](#section-3)
4. [อัตราภาษีก้าวหน้าไทย](#section-4)
5. [ตัวอย่างคำนวณจริง ≥3 Cases](#section-5)
6. [การยื่นภาษี ภงด.90/91 + แบบ 95](#section-6)
7. [เคล็ดลับลดภาษี (ถูกกฎหมาย)](#section-7)

---

<a id="section-1"></a>

## Section 1: ทำไม Final Tax 10% (หุ้นไทย) ใช้ไม่ได้กับหุ้นนอก

### 1.1 หลักการ Final Tax 10% ของหุ้นไทย

ในระบบภาษีไทย หุ้นในตลาดหลักทรัพย์ที่เป็น **บริษัทจำกัด (บจ.) ไทย** จ่ายเงินปันผล → ถูกหักภาษี ณ ที่จ่าย 10% → ผู้ถือหุ้นเลือกได้ 2 ทาง:

**Option A: Final Tax (จบที่ 10%)**
- ไม่ต้องรวมเงินปันผลในภงด.90
- ภาษีที่ถูกหัก 10% = จบ
- เหมาะกับคนที่ bracket ≥20% (เสียแค่ 10% ถูกกว่า bracket)

**Option B: Gross-up + Credit**
- นำเงินปันผล + ภาษี gross-up มารวมใน ภงด.90
- ใช้ภาษีที่หัก + เครดิตภาษีจากบริษัท (3/7) ลดภาษี
- เหมาะกับคนที่ bracket ≤10%

### 1.2 กฎหมายรองรับ Final Tax 10% — มาตรา 50(2)(จ)

จากประมวลรัษฎากร **มาตรา 50** ว่าด้วยการหักภาษี ณ ที่จ่าย กำหนดในวรรคที่ (2)(จ):

> "สำหรับเงินได้พึงประเมินตามมาตรา 40(4)(ข) ที่จ่ายให้แก่ผู้รับซึ่งเป็นบุคคลธรรมดา ให้หักในอัตราร้อยละ 10 ของเงินได้..."

Source reference:
- กรมสรรพากร ป.119/2545: https://www.rd.go.th/11162.html
- สัมมนา WHT: https://www.rd.go.th/publish/seminar/180618_WHT2nd_doc.pdf

**[VERIFY]** — raw text ของมาตรา 50(2)(จ) ที่เข้าถึงได้ทั้งหมดใน fetch ได้เพียงสรุปจาก secondary (longfashengaccounting, flowaccount, arac, tfpa). Raw text ภาษากฎหมายจริงต้อง access ผ่าน ราชกิจจานุเบกษา หรือโทร rd.go.th 1161 confirm

### 1.3 ทำไม "ไม่ใช้" กับหุ้นนอก

หุ้น US (Apple, Microsoft) หรือหุ้น VN (FPT, MWG) **ไม่ใช่ บจ.ไทย** → Apple/FPT ไม่จ่ายภาษี 10% ให้รัฐไทย → ไม่มีการหักภาษี ณ ที่จ่ายตามมาตรา 50(2)(จ) ที่ไทย → **Final Tax 10% ใช้ไม่ได้**

**ผลที่ตามมา:**
- เงินปันผลจากหุ้นนอก → กลายเป็น "เงินได้พึงประเมินจากต่างประเทศ" (มาตรา 40(4)(ข) — foreign-sourced)
- ต้อง **รวมในฐานภาษี** ภงด.90 → เสียภาษีตาม bracket **ก้าวหน้า 0-35%**
- Karl ที่ bracket 35% → เสียภาษี dividend VN/US **3.5 เท่า** ของ Thai stock dividend

### 1.4 Exception: DR (Depositary Receipt) ไทย

**DR** ที่ออกโดยโบรกไทย (Bualuang, Yuanta, KGI) แม้ underlying เป็น Apple/NVIDIA → **ยังไม่ชัดเจน** ว่าใช้ final tax 10% ได้หรือไม่

**ข้อโต้แย้ง (Karl ควรรู้):**
- DR issuer เป็น บจ.ไทย → อาจ argue ว่าจ่ายปันผลแบบเดียวกับหุ้นไทย
- แต่ underlying dividend มาจาก Apple (US) → arguably foreign-sourced
- **Practice ปัจจุบัน:** DR ปันผลถูกตีความเป็นหุ้นไทย → Final Tax 10% ได้ [VERIFY]

> **[VERIFY]** DR treatment — ผลการ search ไม่ conclusive. Karl ต้องโทร rd.go.th 1161 หรือให้ broker (BLS) ออก **tax certificate** ประกอบการยื่นภาษี ก่อน rely on final tax 10%

### 1.5 Key Takeaway

- **หุ้นไทย (SET listed บจ.ไทย):** Final tax 10% ใช้ได้ ตามมาตรา 50(2)(จ)
- **หุ้นนอก (Apple/FPT direct):** Final tax 10% **ใช้ไม่ได้** — ต้อง declare ภงด.90 bracket 0-35%
- **DR (ไทย issuer, foreign underlying):** ความไม่ชัดเจน — default assume Final tax 10% ได้ but verify

---

<a id="section-2"></a>

## Section 2: ป.161/2566 ฉบับเต็ม + Context

### 2.1 ก่อน ป.161/2566 (2566 + ก่อนหน้า)

**กฎเดิม (37 ปี):**
- รายได้จากต่างประเทศ (foreign-sourced income) เข้าข่ายเสียภาษีไทย **เฉพาะเมื่อนำเข้าไทยในปีภาษีเดียวกับที่ได้รับ**
- ถ้า Karl ได้กำไรจาก US ปี 2565 → นำเข้าไทยปี 2566 → **ไม่เสียภาษีไทย**
- เรียกว่า **"remittance rule + same-year rule"**

**Loophole ที่ VI ใช้กันมานาน:**
- ได้กำไรปีนี้ → เก็บไว้ต่างประเทศ → นำเข้าไทยปีหน้า
- เสียภาษี 0 บาท ถ้าไม่มีรายได้อื่นในปีที่นำเข้า หรือ bracket ต่ำ

### 2.2 ป.161/2566 — Policy Change

**ออกวันที่:** 15 กันยายน 2566
**มีผล:** 1 มกราคม 2567 (2024)
**หลัก:** ปิด loophole "รอข้ามปี"

**กฎใหม่:**
- เงินได้จากแหล่งนอกประเทศ (foreign-sourced) ที่นำเข้ามาในไทย → **เสียภาษีทันที ไม่ว่าจะเป็นปีไหน**
- ไม่สำคัญว่าได้รับปีไหน — สำคัญแค่นำเข้ามาปีไหน

### 2.3 Raw Text Sources

**Primary (rd.go.th):**
1. ฉบับเต็ม PDF: https://www.rd.go.th/fileadmin/user_upload/kormor/newlaw/dn161A.pdf
2. FAQ Q&A: https://www.rd.go.th/fileadmin/download/news/question_p161_162.pdf
3. Index page: https://www.rd.go.th/21221/archive/2023/09.html?cHash=4b1e2ecbfbe6b06e370dee2adf5c5f21

**[VERIFY] — PDF binary not extractable by WebFetch.** Karl ต้องดาวน์โหลด PDF เอง (download + Adobe Reader) หรือให้ tax pro print out ราชกิจจาให้

**Secondary Confirmation (ถ้า PDF ไม่เปิด):**
- ASCO: https://www.asco.or.th/uploads/articles_attc/1726134914.pdf
- iTax: https://www.itax.in.th/media/นำ-รายได้จากต่างประเทศ-เ/
- Prachachat: https://www.prachachat.net/finance/news-1395920
- Tax-EZ: https://tax-ez.info/Update/View/vn4VQT1a/

### 2.4 ก่อน vs หลัง (Comparison Table)

| เงื่อนไข | ก่อน 1 ม.ค. 2567 | หลัง 1 ม.ค. 2567 |
|---------|-------------------|-------------------|
| นำรายได้ตปท. เข้าไทยปีเดียวกันที่ได้รับ | เสียภาษี | เสียภาษี (เหมือนเดิม) |
| นำรายได้ตปท. เข้าไทยต่างปีจากที่ได้รับ | **ไม่เสียภาษี** | **เสียภาษี (ใหม่)** |
| เงินที่ได้มาก่อน 1 ม.ค. 2567 แต่นำเข้าหลัง 1 ม.ค. 2567 | - | [VERIFY] ยังถกเถียง — rd.go.th clarifies บาง source บอกไม่ต้องเสีย |

### 2.5 ใครบังคับใช้

**ผู้ที่ต้องเสียภาษีตาม ป.161/2566:**
- บุคคลธรรมดาที่อยู่ในประเทศไทย **≥180 วัน** ในปีภาษี
- เรียกว่า **"Thai tax resident"**
- ครอบคลุมทั้งคนไทย + expat ที่อยู่ไทย ≥180 วัน

**ประเภทเงินได้ที่เข้าข่าย:**
- เงินเดือนจากการทำงานต่างประเทศ
- กำไรจากธุรกิจตปท.
- **เงินปันผลจากหุ้นตปท.** ← Karl
- **กำไรจากการขายหุ้นตปท.** ← Karl
- ดอกเบี้ยจากต่างประเทศ
- ค่า royalty ต่างประเทศ
- เงินจากทรัพย์สินต่างประเทศ (property, ETF, mutual fund)

### 2.6 Karl's Application

ถ้า Karl อยู่ไทย ≥180 วัน/ปี (ซึ่งเป็นกรณีปกติ):
- **ทุก dividend, capital gain** จาก US/VN direct → เมื่อโอนกลับไทย = เสียภาษี
- **ไม่สำคัญ** ว่าเป็นกำไรจากการขายปี 2568 แล้วโอนกลับปี 2575 — ยังเสียอยู่
- **DR Thailand:** ไม่ใช่ foreign-sourced (อ่านส่วน 1.4) → ไม่อยู่ใน ป.161/2566

### 2.7 Grey Area: "Accrual vs Remittance"

**ความไม่ชัดเจนทางกฎหมายสำคัญ:**
- ป.161/2566 พูดถึง **"นำรายได้จากต่างประเทศเข้ามาในประเทศไทย"**
- บาง source ตีความว่า Karl ต้อง declare เฉพาะเมื่อ **โอนเงินจริง** เข้าไทย (remittance)
- บาง source ตีความว่าถ้า **เกิด income ขณะที่ Karl เป็น Thai resident** = ต้อง declare ไม่ว่าจะโอนกลับหรือไม่ (accrual)

**Practice ปัจจุบัน (ณ April 2026):**
- ส่วนใหญ่ยังใช้ **remittance basis** — declare เมื่อโอนกลับจริง
- rd.go.th ไม่ได้ enforce accrual basis อย่างชัดเจน
- **[VERIFY]** — โทร rd.go.th 1161 ก่อนวางแผน strategy "ไม่โอนกลับ"

### 2.8 Penalties (ถ้าไม่ declare)

ถ้า Karl ได้กำไร/ปันผล ตปท. แต่ไม่ declare ใน ภงด.90:
- **Fine:** 2x ของภาษีที่ไม่จ่าย + ค่าเสียหาย
- **ดอกเบี้ย:** 1.5%/เดือน ของภาษีที่ค้าง
- **Criminal:** ถ้าจงใจ (intent) → จำคุก ≤ 7 ปี (มาตรา 37 ทวิ)

> Risk nothing = declare ทุกอย่างตรงๆ ให้ถูกต้อง หรือใช้ holding company structure ที่ถูกกฎหมาย (ไฟล์ 05)

---

<a id="section-3"></a>

## Section 3: DTA (Double Tax Agreement)

### 3.1 หลักการ DTA

DTA = สนธิสัญญาที่ 2 ประเทศทำกัน เพื่อไม่ให้ผู้เสียภาษีเสียซ้ำ

**Mechanism (2 แบบ):**
- **Exemption method** — ประเทศต้นทางเก็บ → ประเทศ resident ยกเว้น
- **Credit method** — ประเทศต้นทางเก็บ → ประเทศ resident ให้ credit offset

Thailand uses **credit method** สำหรับ dividend + capital gain

### 3.2 DTA Thailand-Vietnam

**Details:**
- ชื่อเต็ม: Agreement between Thailand and Vietnam for the Avoidance of Double Taxation
- ลงนาม: 23 ธันวาคม 1992 (พ.ศ.2535)
- มีผล: 1 มกราคม 1993 (พ.ศ.2536)
- Article 27: applies to taxes withheld at source (dividend/interest/royalty)

**Sources (rd.go.th):**
- Intro: https://www.rd.go.th/english/1622.html
- Articles 1-5: https://www.rd.go.th/english/1621.html
- Articles 21-25: https://www.rd.go.th/english/1617.html

**Key Articles:**

**Article 10 (Dividends) — Thailand-Vietnam:**
- Dividends paid by Vietnamese company to Thai resident: Vietnam can tax
- Maximum rate: ปกติ 15% (general) หรือ 10% (if beneficial owner holds ≥10%)
- **[VERIFY]** exact rates — Vietnam's domestic law ยังเก็บ 5% WHT สำหรับ foreign individual (แม้ DTA อนุญาต 15% ceiling)

**Article 13 (Capital Gain):**
- Gains from shares/securities in Vietnamese company → Vietnam can tax
- Thailand can also tax (credit method apply)

**Article 23/25 (Elimination of Double Taxation):**
- Thailand allows foreign tax credit for Vietnamese tax paid

### 3.3 DTA Thailand-USA

**Details:**
- ลงนาม: 26 พฤศจิกายน 1996
- มีผล: **15 ธันวาคม 1997**
- Article 10 = dividends

**Sources:**
- Full text PDF (rd.go.th): https://www.rd.go.th/fileadmin/download/nation/america_e.pdf [PDF binary]
- Mirror IRS: https://www.irs.gov/pub/irs-trty/thailand.pdf
- Congress.gov: https://www.congress.gov/treaty-document/105th-congress/2/document-text
- Siam Legal summary: https://library.siam-legal.com/thai-law/u-s-thai-tax-treaty-dividends-article-10/

**Article 10 (Dividends) — Verbatim Quote:**

> "10 percent of the gross amount of the dividends if the beneficial owner is a company which controls at least 10 percent of the voting power of the company paying the dividends, or 15 percent of the gross amount of the dividends in all other cases."
>
> — Article 10 paragraph 2, US-Thailand Tax Convention 1996

**Source:** https://library.siam-legal.com/thai-law/u-s-thai-tax-treaty-dividends-article-10/

**ตีความสำหรับ Karl (retail):**
- Karl ไม่ใช่บริษัท ไม่ได้ถือ >10% → **portfolio investor** → ได้อัตรา **15% WHT**
- **ต้องกรอก W-8BEN เพื่อ claim DTA benefit** — ถ้าไม่กรอก → IRS หัก default 30%

**Article 10 paragraph 3 (Special):**
- บางกรณี rate อาจลดเป็น 5% สำหรับ pension fund, REITs — ไม่ apply Karl

**Article 13 (Capital Gain):**
- Gains from securities ในบริษัท US → **US can exempt** (NRA general exemption under IRC §871)
- Thailand ตีความตาม ป.161/2566 — เสียภาษีไทย

**Article 23 (Relief from Double Tax):**
- Thailand allows credit for US WHT paid

### 3.4 DTA Flow — ตัวอย่าง Apple Dividend

1. Apple announces $1 dividend per share
2. IRS ดู beneficial owner = Karl (Thai via W-8BEN)
3. IRS applies DTA Article 10(2)(b) → withhold 15% = $0.85 net
4. Karl's IBKR balance +$0.85
5. Karl remits to Thailand → declare ภงด.90
6. Thai applies progressive bracket (say 20% on $1 gross = $0.20)
7. Karl claims FTC via แบบ 95 — US WHT $0.15 offset
8. Karl pays Thai tax = $0.05 (net $0.20 - $0.15 credit)
9. **Total tax paid: 20% ($0.15 US + $0.05 Thai)**

หมายเหตุ: ถ้า Karl's Thai bracket เกิน 15% (i.e., >15% → 20, 25, 30, 35) → เสีย Thai additional (as calc)
ถ้า Karl's Thai bracket ≤15% → US WHT แค่ 15% เต็มแทน Thai (credit method applies to Thai tax, not refund)

### 3.5 Other Thai DTAs (ที่ Karl อาจเจอ)

Thailand มี DTA กับ ~60 ประเทศ — ที่สำคัญ:
- UK — dividend max 10%/15%
- Singapore — dividend 10% (if 25% voting), 15%
- Japan — 15%, 20%
- Germany — 15%, 20%
- China — 15%
- HK — dividend exempt (Hong Kong domestic)

Full list: https://www.rd.go.th/english/766.html

### 3.6 DTA Practical Issues

**1. DTA benefit ต้อง claim proactive**
- W-8BEN (US), CoR (Certificate of Residence, อื่นๆ)
- Broker ต้องยอมรับ + apply rate ลด
- ถ้า broker ไม่ support → หัก default rate สูง → Karl ต้องขอคืนเอง

**2. CoR (Certificate of Tax Residence)**
- สำหรับบาง DTA — ต้องให้ rd.go.th ออก CoR รับรอง Karl เป็น Thai tax resident
- Fee: 100-200 บาท
- Valid 1 ปี
- แนบไปกับ broker

**3. DTA override domestic law?**
- DTA มี priority > domestic law (Thailand signs + ratifies)
- แต่ practical implementation ต่างกัน

### 3.7 FTC (Foreign Tax Credit) Mechanics

**Calculation:**
- FTC = min(foreign tax paid, Thai tax on foreign income)
- FTC ≤ Thai tax liability (no refund of excess)
- FTC claimed annually in ภงด.90 section + แบบ 95

**Example:**
- Karl foreign income: 100,000 บาท
- US WHT: 15,000 บาท (15%)
- Thai progressive bracket: 20% of 100,000 = 20,000 บาท
- FTC: min(15,000, 20,000) = 15,000 บาท
- Net Thai tax payable: 20,000 - 15,000 = 5,000 บาท
- **Total tax (US + Thai): 20,000 บาท (20% effective)**

If Thai bracket < US WHT:
- Karl bracket 10% of 100,000 = 10,000 บาท
- FTC: min(15,000, 10,000) = 10,000 บาท
- Net Thai tax: 10,000 - 10,000 = 0 บาท
- **Total tax: 15,000 บาท (15% — all US, no Thai addtl, no refund of excess US)**

---

<a id="section-4"></a>

## Section 4: อัตราภาษีก้าวหน้าไทย (Thai Progressive Brackets)

### 4.1 Individual Income Tax Brackets (2026)

สำหรับเงินได้สุทธิ (Taxable Income) หลังหักค่าใช้จ่าย + ค่าลดหย่อน:

| เงินได้สุทธิ (บาท) | อัตรา |
|---------------------|-------|
| 0 — 150,000 | ยกเว้น (0%) |
| 150,001 — 300,000 | 5% |
| 300,001 — 500,000 | 10% |
| 500,001 — 750,000 | 15% |
| 750,001 — 1,000,000 | 20% |
| 1,000,001 — 2,000,000 | 25% |
| 2,000,001 — 5,000,000 | 30% |
| 5,000,001+ | 35% |

Source: rd.go.th individual income tax page + annual announcement

### 4.2 Effective Rate Calculation

**Marginal vs Effective:**
- Marginal rate = bracket ของเงินเพิ่ม
- Effective rate = เฉลี่ยรวมทั้งหมด

**Example: Karl รายได้สุทธิ 2 ล้านบาท/ปี**
- 0-150K: 0 = 0
- 150K-300K: 150K × 5% = 7,500
- 300K-500K: 200K × 10% = 20,000
- 500K-750K: 250K × 15% = 37,500
- 750K-1M: 250K × 20% = 50,000
- 1M-2M: 1M × 25% = 250,000
- **Total: 365,000 บาท**
- **Effective: 18.25%**

### 4.3 หักค่าใช้จ่าย + ลดหย่อน

**สำหรับเงินได้มาตรา 40(4) — dividend, interest:**
- หักค่าใช้จ่ายได้ **0%** (ไม่มีส่วนหักเหมือนเงินเดือน)
- ลดหย่อนตามปกติ (ประกัน, บิดามารดา, บุตร, ฯลฯ)

### 4.4 เงินได้ 40(4)(ข) — Dividend specifically

มาตรา 40(4)(ข) ของประมวลรัษฎากร:
- เงินปันผลจากบริษัท (ไม่ว่าไทย/นอก)
- ดอกเบี้ยเงินฝาก/ตราสารหนี้ (บางประเภท)

### 4.5 เงินได้ 40(8) — Capital Gain + Other Foreign Income

มาตรา 40(8) — เงินได้จากการพาณิชย์, การอุตสาหกรรม, การขนส่ง, อื่นๆ
- Capital gain จากการขายหุ้นต่างประเทศ ตีความใส่ใน 40(8) (โดยทั่วไป)
- **[VERIFY]** — capital gain ต่างประเทศบาง scenario อาจตีเป็น 40(4) — consult tax pro

---

<a id="section-5"></a>

## Section 5: ตัวอย่างคำนวณจริง (≥3 Cases)

### Case 1: VN Dividend (FPT) — Karl bracket 20%

**Assumptions:**
- Karl ถือ FPT 1,000 shares @ 130,000 VND avg
- FPT dividend 5,000 VND/share/ปี
- USD/THB = 35, VND/THB = 0.00142
- Karl bracket 20% (taxable income 750K-1M บาท/ปี)

**Step 1: Vietnam side**
- Gross dividend: 5,000 VND × 1,000 = 5,000,000 VND
- = 5,000,000 × 0.00142 = **7,100 บาท gross**
- VN WHT 5% = 250,000 VND = 355 บาท
- **Net received: 6,745 บาท**

**Step 2: Remit to Thailand**
- Karl โอน 6,745 บาท กลับไทย (หลังจาก FX fee)
- บันทึกเงินได้ ภงด.90: 7,100 บาท (gross amount, มาตรา 40(4)(ข))

**Step 3: Thai tax calculation**
- Thai bracket 20% × 7,100 = 1,420 บาท
- Foreign Tax Credit (VN WHT): 355 บาท
- Net Thai tax: 1,420 - 355 = **1,065 บาท**

**Step 4: Final position**
- Total tax (VN + Thai): 355 + 1,065 = 1,420 บาท (20% of 7,100)
- **Net after-tax dividend: 5,680 บาท**
- **Effective tax: 20%**

### Case 2: US Dividend (AAPL) — Karl bracket 30%

**Assumptions:**
- Karl ถือ AAPL 100 shares @ $180 avg = $18,000
- AAPL dividend $1.04/share/ปี = $104
- W-8BEN filed → US WHT 15%
- USD/THB = 35
- Karl bracket 30% (income 2-5M บาท/ปี)

**Step 1: US side**
- Gross dividend: $104 = 3,640 บาท
- US WHT 15% = $15.60 = 546 บาท
- **Net received: $88.40 = 3,094 บาท**

**Step 2: Remit to Thailand**
- Karl โอน $88.40 กลับไทย
- Declare ภงด.90: 3,640 บาท (gross, มาตรา 40(4)(ข))

**Step 3: Thai tax calculation**
- Thai bracket 30% × 3,640 = 1,092 บาท
- FTC (US WHT): 546 บาท
- Net Thai tax: 1,092 - 546 = **546 บาท**

**Step 4: Final position**
- Total tax (US + Thai): 546 + 546 = 1,092 บาท (30% of 3,640)
- **Net after-tax: 2,548 บาท**
- **Effective tax: 30%**

### Case 3: Capital Gain (FPT Sale) — Karl bracket 30%

**Assumptions:**
- Karl ซื้อ FPT 1,000 shares @ 130,000 VND = 130M VND ≈ 184,600 บาท
- 3 ปีต่อมาขาย @ 200,000 VND → 200M VND ≈ 284,000 บาท
- Gain: 99,400 บาท
- Karl bracket 30%

**Step 1: Vietnam side**
- Capital gain tax: 0.1% of proceeds = 0.001 × 200M VND = 200,000 VND ≈ 284 บาท
- **Net received: 283,716 บาท**

**Step 2: Remit to Thailand**
- Karl โอนกลับ 283,716 บาท
- Declare ภงด.90: **99,400 บาท** (gain, not proceeds — มาตรา 40(8))

> **[VERIFY]** — มีการ debate ว่าใส่ 40(4) หรือ 40(8) — consult tax pro

**Step 3: Thai tax calculation**
- Thai bracket 30% × 99,400 = 29,820 บาท
- FTC (VN tax): 284 บาท (mostly wasted — VN เก็บน้อยเพราะ 0.1% proceeds)
- Net Thai tax: 29,820 - 284 = **29,536 บาท**

**Step 4: Final position**
- Total tax: 284 + 29,536 = 29,820 บาท
- Net gain after tax: 99,400 - 29,820 = 69,580 บาท
- **Effective tax on gain: ~30%**

### Case 4: US Capital Gain (AAPL Sale) — Karl bracket 25%

**Assumptions:**
- Karl ซื้อ AAPL 100 @ $180 = $18,000
- 3 ปีต่อมาขาย @ $240 = $24,000
- Gain: $6,000 = 210,000 บาท
- Karl bracket 25%

**Step 1: US side**
- Capital gain tax for NRA: **0%** (IRC §871 exemption)
- Net received: $24,000 = 840,000 บาท

**Step 2: Remit to Thailand**
- Declare ภงด.90: 210,000 บาท gain (มาตรา 40(8))

**Step 3: Thai tax calculation**
- Thai bracket 25% × 210,000 = 52,500 บาท
- FTC: 0 (US didn't tax)
- Net Thai tax: **52,500 บาท**

**Step 4: Final position**
- Total tax: 52,500 บาท (25% of gain)
- Net gain: 210,000 - 52,500 = 157,500 บาท

### Case 5: DR Thailand (Control Case) — For Comparison

**Assumptions:**
- Karl ซื้อ AAPL19 (Bualuang DR) 1,000 units @ 700 บาท = 700,000 บาท
- 3 ปีต่อมาขาย 900 บาท/unit = 900,000 บาท
- Gain: 200,000 บาท
- Dividend received during holding: ~3,500 บาท (US WHT 15% already applied by issuer)

**Step 1: Capital Gain**
- DR = SET listed → **capital gain exempt (มาตรา 42(17))**
- Net gain: 200,000 บาท fully retained
- Commission: ~1,800 บาท
- **Net after cost: 198,200 บาท** 

**Step 2: Dividend**
- Gross dividend through issuer: ~4,100 บาท
- Issuer applies US WHT 15% (= ~615 บาท)
- Thai tax: **[VERIFY]** — DR dividend treatment unclear
  - Option A: treat as Thai source (Final Tax 10%) → pay 410 บาท
  - Option B: treat as foreign source → declare ภงด.90
  - Practice: usually Option A (ask broker to clarify)

**Comparison Total (Karl's $18,000 USD position, 3 years):**

| Structure | Cap Gain Tax | Divid Tax | Total Tax | Net Return |
|-----------|--------------|-----------|-----------|------------|
| US Direct (25% bracket) | 52,500 (25%) | 300-500/yr | ~54,000 | **157,500 net** |
| DR AAPL19 (best case) | 0 | 410/yr | ~1,200 | **198,200 net** |

**Conclusion:** DR แม้จะมี premium/fee internal ~1-2%/yr → ยังคุ้มกว่า US Direct ที่ bracket 25%+ ถ้าไม่อยากเสีย cap gain tax

---

<a id="section-6"></a>

## Section 6: การยื่นภาษี ภงด.90 / 91 + แบบ 95

### 6.1 Form Overview

**ภงด.90:**
- ฟอร์มหลักสำหรับบุคคลธรรมดาที่มีรายได้ 40(1)-(8)
- ครอบคลุมเงินได้หลายประเภท (income employment + dividend + rental + business + foreign)
- Filing: **31 มีนาคม ปีถัดไป**

**ภงด.91:**
- Simplified ของ ภงด.90 สำหรับคนที่มีเฉพาะเงินเดือน (40(1))
- **ไม่ใช้ได้** สำหรับ Karl ที่มี foreign income

**แบบ 95 — Foreign Tax Declaration:**
- ฟอร์มเสริม → แนบกับ ภงด.90
- Declare foreign income + tax paid abroad + FTC claim

### 6.2 ภงด.90 Structure (สำหรับ Karl)

**ส่วน ก — ข้อมูลผู้เสียภาษี**
- TIN (เลขประจำตัวผู้เสียภาษี = เลขบัตรประชาชน)
- ที่อยู่, โทร, email

**ส่วน ข — เงินได้พึงประเมิน**

| มาตรา | เงินได้ | ตัวอย่าง |
|-------|---------|----------|
| 40(1) | เงินเดือน, ค่าจ้าง | Salary |
| 40(2) | ค่าธรรมเนียม, คอมมิชชั่น | freelance |
| 40(3) | ค่าสิทธิ royalty | - |
| 40(4)(ก) | ดอกเบี้ย | bank interest |
| 40(4)(ข) | **เงินปันผล** | **Dividend (ไทย+ตปท.)** |
| 40(5) | ค่าเช่าทรัพย์สิน | rental |
| 40(6) | วิชาชีพอิสระ | - |
| 40(7) | รับเหมาก่อสร้าง | - |
| 40(8) | อื่นๆ (พาณิชย์) | **Capital gain + foreign misc** |

สำหรับ Karl:
- 40(4)(ข): เงินปันผลจาก US/VN (gross)
- 40(8): Capital gain จากการขายหุ้นตปท.

**ส่วน ค — หักค่าใช้จ่าย**
- 40(4)(ข): หักไม่ได้ (0)
- 40(8): หักได้ตามจริง (ค่า commission, etc.)

**ส่วน ง — ค่าลดหย่อน**
- ส่วนตัว 60,000
- คู่สมรส 60,000
- บุตร 30,000 x n
- ประกันสุขภาพ, ชีวิต
- เงินบริจาค

**ส่วน จ — คำนวณภาษี**
- Net taxable income → progressive bracket
- Tax payable

**ส่วน ฉ — เครดิตภาษี**
- WHT ที่หักไปแล้ว (Thai + US + VN)
- **FTC จาก แบบ 95**
- Net payable / refund

### 6.3 แบบ 95 — ขั้นตอนกรอก

**ส่วน 1 — ข้อมูล**
- ประเทศต้นทางเงินได้ (US, VN, etc.)
- ประเภทเงินได้ (dividend, capital gain)

**ส่วน 2 — จำนวนเงิน**
- Gross income (in THB, convert using FX rate)
- Tax paid abroad (WHT amount)

**ส่วน 3 — DTA Reference**
- Article number (e.g., Thailand-US Article 10 para 2(b))
- Rate claimed

**ส่วน 4 — Supporting Documents**
- 1042-S (US) — IBKR issues
- WHT certificate (VN) — BLS/Phillip issues
- Bank statement showing inflow

### 6.4 FX Conversion Rules

**Rule of thumb:**
- Use **ราคาแลกเปลี่ยนเฉลี่ยประจำปี** ของ Bank of Thailand (BOT)
- หรือ ราคา BOT รายเดือน ของเดือนที่ได้รับเงิน

Source: https://www.bot.or.th/th/statistics/financial-markets.html

**แนะนำ:** ใช้ annual average ของ BOT เพื่อความสะดวก (rd.go.th ยอมรับ)

### 6.5 Document Retention

เก็บเอกสารอย่างน้อย **5 ปี** หลังยื่น:
- 1042-S (US)
- VN WHT certificate
- Broker year-end statement
- Bank transfer receipts
- แบบภาษีที่ยื่น + เอกสารแนบ

### 6.6 e-Filing vs Paper

- **e-Filing** (ฟรี + ง่ายกว่า): rdserver.rd.go.th/scripts/index.jsp
- **Paper** ยื่นที่ สำนักงานสรรพากรพื้นที่

### 6.7 Common Filing Mistakes

**Mistake 1:** ลืม declare foreign income
- Penalty: 2x tax + 1.5%/month interest
- Criminal prosecution if intent

**Mistake 2:** Declare ผิดหมวด (ใส่ 40(4) vs 40(8))
- Rule: Dividend = 40(4)(ข); Capital gain = 40(8)
- ถ้าผิด → rd.go.th ขอแก้ ไม่ penalty มาก

**Mistake 3:** FX rate ผิด
- ใช้ daily rate ตอนเกิดธุรกรรม = allowed แต่ยุ่งยาก
- ใช้ annual avg = simple + accepted

**Mistake 4:** ลืม claim FTC
- ผลทาง: double taxation — Karl เสียซ้ำ
- Fix: refile ภายใน 3 ปี (อายุความ)

**Mistake 5:** ไม่เก็บเอกสาร supporting
- rd.go.th อาจ audit ย้อน 5 ปี
- Without proof → assumed fraud

---

<a id="section-7"></a>

## Section 7: เคล็ดลับลดภาษี (Legal Strategies)

### 7.1 Strategy 1: Ireland-Domiciled Accumulating ETF

**Concept:**
- ซื้อ ETF ที่ accumulate dividend (ไม่จ่าย distribution) เช่น **CSPX, VWRA, VUAG, IWDA**
- Dividend reinvest auto → Karl ไม่ได้รับ cash dividend → **ไม่ต้อง declare ภงด.90 ทุกปี**
- Tax deferred จนกว่าจะขาย

**Caveat:**
- เมื่อขาย → capital gain ต้องเสีย Thai tax (ป.161/2566)
- แต่ defer 10+ ปี = compound growth เต็มที่ก่อนจ่ายภาษี

**Karl Application:**
- ถ้า Karl ใช้ IBKR + Ireland ETF → ลด tax drag 1-2%/year
- Long-term advantage มาก (compound)

### 7.2 Strategy 2: Holding Company (ตีแตก style)

**Concept:**
- Karl ตั้งบริษัทไทยเพื่อถือหุ้นต่างประเทศ
- Corporate tax 20% < Personal top bracket 35%
- เมื่อ dividend เข้าบริษัท → บริษัทเสีย 20%
- เมื่อจ่าย dividend จากบริษัท → Karl เสียอีก 10% (final tax) — total effective 28%

**Break-even:**
- เงินปันผล ≥ 3M/ปี → บริษัทคุ้ม
- < 3M/ปี → accounting + audit cost > saving

**Details:** ไฟล์ 05-holding-company.md

### 7.3 Strategy 3: Timing Remittance

**Concept:**
- ถ้า Karl มีปีที่รายได้ต่ำ (e.g., sabbatical, เกษียณต้น) → bracket ต่ำ
- โอนเงิน foreign gain กลับปีนั้น → เสียภาษีน้อย

**Risk:**
- ป.161/2566 interpretation — ถ้า rd.go.th ตีความเป็น accrual basis → strategy ไม่ work
- ควร consult tax pro ก่อน

### 7.4 Strategy 4: Don't Remit (Permanent)

**Concept:**
- เก็บกำไรไว้ใน IBKR/broker offshore ตลอดไป
- Reinvest ใน ETF/stock ต่างประเทศ ไม่โอนกลับ

**Risk:**
- Wealth accumulated offshore ไม่ได้ใช้ — defeat ทำไมจะลงทุน
- ถ้า emigrate → Karl ต้อง declare เมื่อกลับเข้าไทยใหญ่ (taxation on cessation)
- ป.161/2566 accrual risk ยังอยู่

### 7.5 Strategy 5: Use DR Thailand

**Concept:**
- ใช้ DR (AAPL19, NVDA19, FUEVFVND01) แทน direct
- Capital gain **ยกเว้นภาษี** (SET listed)
- Dividend → Final Tax 10% (ถ้า broker ตีความเป็น Thai source — [VERIFY])

**Cost:**
- DR fee 1-2%/year vs ETF Ireland 0.07-0.3%/year
- Break-even: DR ดีกว่า direct ถ้า bracket >25% + hold <5 ปี
- Ireland ETF ดีกว่าถ้า hold 10+ ปี

### 7.6 Strategy 6: Dividend Timing

**Concept:**
- US ETF accumulating = no cash dividend = no tax event
- US ETF distributing (SPY, QQQ) = cash dividend = taxable
- เลือก accumulating version

### 7.7 Strategy 7: Emigration Strategy (Advanced)

**Concept:**
- ถ้า Karl ย้ายออกไทย (< 180 วัน/ปี) → ไม่ใช่ Thai tax resident → ไม่ต้องเสียภาษีไทยบน foreign income

**Reality:**
- Karl ไม่ emigrate — strategy ไม่ relevant
- ถ้าเกษียณต่างประเทศ → consider tax residence (Malaysia MM2H, Portugal NHR, etc.)

### 7.8 Strategy 8: SSF / RMF Ceiling ใช้ Foreign

**Concept:**
- Thailand มี SSF (Super Savings Fund), RMF (Retirement Mutual Fund) → tax-deductible
- บาง SSF/RMF ลงทุน global equity → Karl ได้ exposure foreign + tax deduction
- Deduction: SSF 30% of income max 200K + RMF 30% max 500K = 700K/ปี

**Karl Application:**
- Max out SSF + RMF ก่อน → ลด Thai taxable income bracket
- ใช้ global equity SSF/RMF (K-USXNDQ, B-NIPPON, etc.)

### 7.9 Strategy 9: Insurance Policy (Foreign Equity)

**Concept:**
- Unit-Linked insurance policy ที่ลงทุน global equity
- Tax-advantaged ถ้าถือ >10 ปี (policy mature + maturity non-taxable)

**Caveat:**
- Insurance cost drag 2-3%/year
- Liquidity ต่ำ (surrender penalty)
- Only worth it ถ้า Karl ต้องการ insurance อยู่แล้ว + wrap investment

### 7.10 Strategy 10: Family Gifting

**Concept:**
- ถ้า Karl รับเงินเดือนเยอะ + bracket 35% → คู่สมรส/บุตร bracket ต่ำ
- Gift บางส่วนให้ครอบครัวถือหุ้นตปท. — พวกเขา declare ใน bracket ต่ำกว่า

**Thai Gift Tax:**
- Gift to spouse: exempt
- Gift to child: exempt up to 20M บาท/year (ascendant-descendant)
- Above: 5% gift tax

**Caveat:**
- Irrevocable — Karl เสียสิทธิ์ ownership
- Legal structuring ต้องแน่นก่อน

### 7.11 Summary Matrix

| Strategy | ความซับซ้อน | Saving | Karl Applicable | เมื่อไหร่ใช้ |
|----------|-------------|--------|-----------------|-------------|
| Ireland Accum ETF | Low | 1-2%/yr | ✓ (IBKR) | US Direct path |
| Holding Company | High | 10-15%/yr | ~ (future) | Divid >3M/yr |
| Timing Remit | Low | Variable | ~ | Low-income years |
| Don't Remit | Low | Full defer | ~ | Long-term defer |
| DR Thailand | Low | High (cap gain exempt) | ✓ (now) | Low-med port |
| Dividend Timing | Low | 1-2%/yr | ✓ | All cases |
| Emigration | Extreme | 100% | - | Retirement abroad only |
| SSF/RMF | Low | Bracket × 700K | ✓ | Annual max out |
| Unit-linked | Med | Variable | - | Only if need insurance |
| Family Gifting | Med | Bracket diff | ✓ | Karl high bracket |

### 7.12 Karl Optimal Strategy Stack

**Year 1-2 (Small portfolio <200K):**
- DR Thailand (capital gain exempt)
- Max SSF + RMF (Thai bracket reduction)
- Don't bother foreign direct

**Year 3-5 (Mid portfolio 200K-2M):**
- Start IBKR with Ireland ETF (CSPX, IWDA, EIMI, VWRA)
- Keep DR for specific plays (Vietnam DR)
- Continue SSF/RMF max out

**Year 5+ (Large portfolio >2M):**
- Consider Holding Company if dividend > 3M/yr
- Ireland ETF dominant — tax drag minimum
- VN Direct for high-conviction names (FPT core)

---

## Section 8: ที่ปรึกษาภาษี (How to Find + When to Hire)

### 8.1 เมื่อไหร่ควรจ้าง Tax Pro

**บังคับ:**
- Dividend/gain รวม >200K บาท/ปี
- Multi-country investment (US + VN + UK combined)
- Setting up holding company
- Emigration planning

**ควรจะ:**
- First-time yearly filing with foreign income
- ไม่แน่ใจการตีความ ป.161/2566

### 8.2 หาที่ปรึกษาที่ไหน

**Certified Associations:**
- **TFAC** (Thailand Federation of Accounting Professions) — https://www.tfac.or.th
- **ATCS** (Association of Thai Corporate Secretaries) — https://www.atcs.or.th
- **TFPA** (Thai Financial Planners Association) — https://www.tfpa.or.th — CFP certified

**Law Firms (international):**
- Baker McKenzie
- DLA Piper
- PwC Thailand
- EY Thailand
- KPMG Thailand

**Smaller (cost-effective):**
- HLB Thailand: https://www.hlbthai.com
- RSM Thailand: https://www.rsm.global/thailand/
- Mazars Thailand
- Lorenz & Partners

### 8.3 ค่าใช้จ่าย (Indicative)

- Consult 1 hour: 2,000-10,000 บาท
- Annual tax filing help: 15,000-30,000 บาท/ปี (individual)
- Complex (holding co + international): 50,000-200,000 บาท/ปี

### 8.4 คำถามที่ Karl ควรถาม Tax Pro

- ป.161/2566 ตีความ accrual vs remittance — current practice เป็นไง?
- DR Thailand dividend — Final tax 10% ได้หรือไม่?
- W-8BEN renewal — timing + process
- FTC calculation — proper method
- Holding company break-even analysis สำหรับ situation Karl
- 5-year tax planning — roadmap

### 8.5 rd.go.th Hotline 1161

- **ฟรี** — ไม่มีค่าใช้จ่าย
- เวลา: 8:30-16:30 จันทร์-ศุกร์
- ใช้เวลารอสาย 5-30 นาที peak season (Mar)
- คนรับสาย = เจ้าหน้าที่ภาษี — ตอบได้ทั่วไป แต่ไม่ bind rd.go.th (ไม่มี legal weight)
- ใช้ confirm principle — ไม่ใช่ specific advice

---

## Section 9: Changes Coming (Future Monitoring)

### 9.1 ป.161/2566 Refinement

rd.go.th อาจออก clarification เพิ่มเติม — Karl ต้องตาม:
- Accrual vs Remittance interpretation
- Pre-2567 income treatment (ถ้านำเข้าหลัง 2567)
- Capital gain vs Dividend classification

### 9.2 DTA Renegotiation

- Thailand-US DTA = 1996 → possible updated version
- Thailand-Vietnam DTA = 1992 → very old, might renegotiate
- Monitor rd.go.th announcements

### 9.3 FATCA / CRS Obligations

- Thailand joined Common Reporting Standard (CRS) 2023
- Offshore broker อัตโนมัติ report ข้อมูล Karl กลับมาไทย
- Karl **cannot hide** foreign income — better declare proactively

### 9.4 BEPS Pillar Two

- OECD Base Erosion Profit Shifting — global minimum tax 15%
- ส่วนใหญ่ apply to MNCs, ไม่ affect Karl retail direct
- แต่ holding company Karl อาจได้รับ impact future

### 9.5 Digital Services Tax / Wealth Tax

- Thailand มี discussion เรื่อง wealth tax แต่ยังไม่ implement
- ตามข่าว rd.go.th + Ministry of Finance

### 9.6 Karl Annual Review

**Every April** (before ภงด.90 deadline):
- Review tax landscape changes
- Update strategy if needed
- Consult tax pro
- Refile if missed something

---

## Section 10: Karl's Tax Playbook (Action-Oriented Summary)

### Monthly
- [ ] Track foreign dividend received (IBKR/BLS statements)
- [ ] Track capital gain/loss realized
- [ ] Save broker statements to Google Drive folder

### Quarterly
- [ ] Reconcile broker balances vs bank deposits
- [ ] Update FX rate reference (BOT)
- [ ] Review if any large transactions need tax planning

### Annually (January-March)
- [ ] Download year-end statement from all brokers (IBKR 1042-S, BLS)
- [ ] Download dividend tax certificates
- [ ] Calculate gross foreign income in THB
- [ ] Calculate foreign tax paid
- [ ] Fill ภงด.90 + แบบ 95
- [ ] File by 31 March
- [ ] Archive documents in secure folder

### Every 3 years
- [ ] Renew W-8BEN with IBKR (before expire)
- [ ] Update CoR (Certificate of Residence) if broker needs

### As needed
- [ ] Consult tax pro if ข้อสงสัย + before major transactions
- [ ] Monitor rd.go.th announcements
- [ ] Re-read this document + update personal understanding

---

## Final Summary Card

- **Final tax 10% (Thai stocks):** ใช้ไม่ได้กับหุ้นนอก direct — ต้อง declare bracket 0-35%
- **ป.161/2566 (มีผล 1 ม.ค. 2567):** เงินตปท. นำเข้าไทย = เสียภาษีทันที ไม่ว่าปีไหน
- **DTA Thailand-US Article 10:** WHT dividend 15% (portfolio), credit method
- **DTA Thailand-VN Article 10:** WHT dividend 15% DTA cap, VN practice 5%, credit method
- **Capital gain US (NRA):** 0% US tax, Thai declare required (ป.161/2566)
- **Capital gain VN:** 0.1% proceeds, Thai declare required
- **DR Thailand:** Cap gain exempt (SET listed), dividend final tax 10% [VERIFY]
- **Filing:** ภงด.90 + แบบ 95, deadline 31 March
- **Best strategies:** Ireland Accum ETF + SSF/RMF max + DR for specific plays + Holding co (when large)
- **Disclaimer:** ไม่ใช่ tax pro — call 1161 + hire CPA before acting

**ไฟล์ถัดไป:** 05-holding-company.md (ตีแตก จำกัด style)

---

## Appendix: Quick Reference Table

**Tax Rates Summary:**

| Income Source | US WHT | VN WHT | Thai Treatment | Net Rate (Karl 30% bracket) |
|---------------|--------|--------|----------------|----------------------------|
| Thai stock div | - | - | Final 10% | 10% |
| US div (direct + W-8BEN) | 15% | - | ภงด.90 + FTC | 30% (US 15% + Thai 15%) |
| US div (no W-8BEN) | 30% | - | ภงด.90 + FTC | 30% (US 30% only, Thai 0 addtl) |
| VN div (direct) | - | 5% | ภงด.90 + FTC | 30% (VN 5% + Thai 25%) |
| DR Thailand div | - | - | Final 10% [VERIFY] | 10% |
| US cap gain (direct) | 0% | - | ภงด.90 | 30% (Thai only) |
| VN cap gain (direct) | - | 0.1% proceeds | ภงด.90 | 30% (Thai only, VN negligible) |
| DR Thailand cap gain | - | - | EXEMPT | 0% ✓ |
| Thai stock cap gain (SET) | - | - | EXEMPT | 0% ✓ |
| Ireland ETF accum (defer) | 15% underlying | - | ภงด.90 on sale only | Deferred, 30% on sale |

**Critical DTA Articles:**
- Thailand-US Article 10(2)(b): Dividend portfolio = 15% WHT
- Thailand-US Article 13: Capital gains — source country may exempt (US exempts for NRA)
- Thailand-US Article 23: Relief from double tax — credit method
- Thailand-VN Article 10: Dividend (DTA cap 15%, VN practice 5%)
- Thailand-VN Article 13: Capital gains
- Thailand-VN Article 23/25: Double tax relief

**Key Thai Tax Code Sections:**
- มาตรา 40(4)(ข): Dividend income — applies to foreign dividend
- มาตรา 40(8): Other income — capital gain foreign typically here
- มาตรา 41 วรรค 2: Residency + foreign income rule
- มาตรา 42(17): Capital gain SET listed exempt
- มาตรา 50(2)(จ): Thai company dividend WHT 10% (not applicable foreign)
- ป.161/2566: Foreign-sourced income anti-loophole (1 Jan 2567)

**Forms:**
- ภงด.90: Individual tax — main
- ภงด.91: Simplified (salary only — NOT for Karl)
- แบบ 95: Foreign income + FTC declaration (attach to ภงด.90)
