---
project: MaxMahon
created: 2026-04-20
last_updated: 2026-04-20
status: active
audience: Karl (Thai investor, 0 experience foreign investing)
---

# 01 — Quick Win: ลงทุนหุ้น US ผ่าน DR (ทำได้พรุ่งนี้)

> **TL;DR** — ถ้า Karl อยากลงทุน Apple/Microsoft/NVIDIA ตั้งแต่อาทิตย์หน้า โดยไม่ต้องเปิดบัญชีใหม่ ไม่ต้องโอนเงินไปต่างประเทศ ไม่ต้องกรอกฟอร์มภาษีอเมริกา **คำตอบคือ DR** (Depositary Receipt) — ซื้อขายในตลาด SET เป็นเงินบาท ใช้บัญชีหุ้นไทยเดิมได้เลย

---

## ส่วนที่ 1: DR คืออะไร (อธิบายแบบไม่ technical)

**DR ย่อมาจาก Depositary Receipt** = "ตราสารแสดงสิทธิการฝากหลักทรัพย์ต่างประเทศ"

ลองนึกภาพแบบนี้:
- มีบริษัท Apple อยู่ที่อเมริกา ราคาหุ้น $200/หุ้น
- Karl อยากซื้อ Apple แต่ไม่อยากเปิดบัญชีอเมริกา
- บริษัทไทย (เช่น บัวหลวง, Yuanta, KGI) ไปซื้อ Apple มาเก็บไว้ในบัญชีของเขาที่อเมริกา
- แล้วออก "ใบฝาก" (DR) ขึ้นมา ขายในตลาด SET เป็นเงินบาท
- Karl ซื้อ DR = ได้สิทธิ์เป็นเจ้าของ Apple โดยอ้อม
- Apple ขึ้น 10% → DR ขึ้น 10% (ตามอัตราแลกเปลี่ยน + ค่าธรรมเนียม)
- Apple จ่ายปันผล → ผู้ออก DR เก็บปันผลแล้วโอนต่อให้ Karl เป็นเงินบาท

**สรุปง่ายๆ:** DR = หุ้นนอกในเสื้อไทย ซื้อขายแบบหุ้นไทย แต่ราคาวิ่งตามหุ้นนอก

แหล่งข้อมูล official:
- SET DR overview: https://www.set.or.th/en/market/product/dr/overview
- Bualuang knowledge: https://knowledge.bualuang.co.th/knowledge-base/what-dr/

---

## ส่วนที่ 2: ทำไม Karl ทำได้พรุ่งนี้

**เงื่อนไขที่ต้องมี (Karl มีหมดแล้ว):**
- บัญชีหุ้นไทยที่ active (Bualuang/InnovestX/KKPS/Phillip/etc.) ✓
- มีเงินบาทในบัญชี ✓
- รู้วิธีกดซื้อขายหุ้นในแอป Streaming/Settrade ✓

**สิ่งที่ไม่ต้องทำ (เทียบกับ US Direct):**
- ไม่ต้องเปิดบัญชี IBKR/Tiger
- ไม่ต้องกรอก W-8BEN
- ไม่ต้อง wire transfer/SWIFT
- ไม่ต้องแลกเงิน USD เอง
- ไม่ต้องเปิดเผยข้อมูลให้ IRS (ภายในขอบเขต DR)

**สิ่งที่ Karl ต้องทำเพิ่ม (ครั้งเดียว):**
- บางโบรกเกอร์ต้องกด "เปิดสิทธิ์เทรด DR" ในแอป (มันคือหุ้นต่างประเทศ ระบบบางทีต้อง enable)
- เซ็นรับทราบความเสี่ยง risk disclosure ของ DR (online ในแอปเอง)

---

## ส่วนที่ 3: รายชื่อ DR ในตลาด SET (ปัจจุบัน 2026)

> ข้อมูลจาก Finnomena update 19 ม.ค. 2026 (https://www.finnomena.com/definit/all-dr-2025/) + cross-check Bualuang/Yuanta/SET

### Symbol convention

DR ใช้รูปแบบ `XXXXX##` โดย:
- `XXXXX` = ชื่อย่อหุ้น/ETF (เช่น AAPL, MSFT, NVDA)
- `##` = รหัส issuer (โบรกเกอร์ผู้ออก) เช่น 01, 03, 06, 11, 13, 19, 23, 80

**Issuer code ที่พบบ่อย:**
- `01` = Bualuang Securities (ชุดเดิม)
- `19` = Bualuang Securities (ชุดใหม่ ค่าธรรมเนียมต่างกัน)
- `80` = ผู้ออก KGI หรือ KTBST (ตรวจสอบเพิ่ม [VERIFY])
- `11`, `13`, `23` = ผู้ออกอื่น (settrade ต้อง verify [VERIFY])

> [VERIFY] issuer code mapping ทั้งหมด — ก่อนซื้อต้องเช็คในแอป settrade ว่าใครเป็นผู้ออก (rare กรณี issuer ปิดทำการ → DR คุณค่าหายได้)

### กลุ่ม Tech Mega-Cap (US)

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| AAPL01, AAPL03, AAPL80 | Apple Inc. | NASDAQ | iPhone maker |
| MSFT01, MSFT06, MSFT80 | Microsoft Corp. | NASDAQ | Cloud + AI Copilot |
| NVDA01, NVDA03, NVDA06, NVDA19, NVDA80 | NVIDIA Corp. | NASDAQ | AI GPU leader |
| TSLA01, TSLA03, TSLA80 | Tesla Inc. | NASDAQ | EV |
| GOOGL01, GOOG... | Alphabet (Google) | NASDAQ | search + Gemini |
| AMZN01, AMZN... | Amazon | NASDAQ | e-commerce + AWS |
| META01, META... | Meta Platforms | NASDAQ | Facebook/Instagram |

### กลุ่ม China Tech / E-commerce

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| BABA01, BABA06, BABA13, BABA23, BABA80 | Alibaba Group | HKEX/NYSE | Jack Ma's company |
| TENCENT01, TENCENT06, TENCENT13, TENCENT19, TENCENT80 | Tencent Holdings | HKEX | WeChat |
| BIDU01, BIDU06, BIDU23, BIDU80 | Baidu | NASDAQ/HKEX | China search |
| JD80 | JD.com | NASDAQ | China e-commerce |

### กลุ่ม Semiconductors

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| ASML01 | ASML Holding | AEX (Netherlands) | EUV lithography monopoly |
| TSMC01, TSMC80 | Taiwan Semiconductor | TWSE/NYSE | World's largest foundry |
| AVGO80 | Broadcom | NASDAQ | AI chip + VMware |

### กลุ่ม Healthcare/Pharma

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| JNJ03 | Johnson & Johnson | NYSE | dividend aristocrat |
| LLY80 | Eli Lilly | NYSE | GLP-1/Mounjaro |
| ABBV19 | AbbVie | NYSE | pharma + dividend |

### กลุ่ม Financials

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| JPMUS06, JPMUS19 | JPMorgan Chase | NYSE | largest US bank |
| BAC03 | Bank of America | NYSE | |
| DBS19 | DBS Group | SGX | Singapore bank |

### กลุ่ม Vietnam (สำคัญสำหรับ Karl ตามแนว ดร.นิเวศน์)

| DR Symbol | หุ้นต้นฉบับ | ตลาดต้นทาง | หมายเหตุ |
|-----------|-------------|-------------|----------|
| VCB11, VCB19 | Vietcombank | HOSE | VN ธนาคาร #1 |
| MWG11, MWG19 | Mobile World | HOSE | VN retail #1 (ดร.นิเวศน์ ถือ) |
| FUEVFVND01 | Diamond ETF (VFM) | HOSE | VN top stocks ETF |

> **โอกาส:** DR เวียดนามเป็นทางลัดถ้า Karl อยากเริ่ม VN exposure แต่ยังไม่อยากเปิดบัญชี VN direct (อ่านต่อในไฟล์ 02)

### กลุ่ม ETF (Index)

| DR Symbol | ETF ต้นฉบับ | tracking |
|-----------|--------------|----------|
| SP50001, SP500US19, SP500US80 | SPY/IVV/VOO | S&P 500 |
| NDX01, QQQM19 | QQQ/QQQM | NASDAQ-100 |
| CN01, CN23 | China index ETF | China |
| NIKKEI80, JAPAN13 | Japan index | Japan |

> **เหมาะกับ passive Karl** — ไม่อยากเลือกหุ้นเอง แต่อยาก expose ตลาด → ซื้อ SP50001 หรือ QQQM19 (เลียนแบบ S&P 500/NASDAQ-100)

> **[VERIFY]** ตัวเลข 300+ DR symbols ที่ Finnomena claim — ต้องเช็คใน settrade screener ก่อนตัดสินใจซื้อ symbol เฉพาะตัว เพราะบางตัว delist/illiquid ได้

---

## ส่วนที่ 4: ขั้นตอนซื้อ DR (Karl ทำอย่างไร)

### Step 1: เปิดสิทธิ์เทรด DR (ครั้งเดียว)

แต่ละโบรกต่างกัน:

**Bualuang (BLS):**
- เข้าแอป Streaming → Settings → Service Request → "DR/DRx" → เปิด
- หรือโทร 02-231-3777
- รอ 1-2 วันทำการ

**InnovestX (SCB):**
- แอป Innovestx → Profile → Account Services → Foreign Securities/DR
- บางครั้งต้องเซ็น risk disclosure online

**KKPS / Phillip:**
- ผ่าน Streaming หรือ POEMS โดยทั่วไป DR เปิดให้ทุกบัญชี (ไม่ต้องขอเพิ่ม) แต่ถ้าซื้อไม่ได้ → ติดต่อ marketing

> ถ้า Karl ใช้โบรกหลัก **Bualuang** (สมมติฐานจาก context ว่ามีบัญชีอยู่) — เริ่มจาก BLS ง่ายสุด เพราะเป็น issuer หลักของ DR series 01/19

### Step 2: หา DR ที่ต้องการในแอป

**ใน Streaming:**
- พิมพ์ symbol เช่น `AAPL19` ในช่องค้นหา
- ถ้าเจอ = ซื้อขายได้
- ถ้าไม่เจอ = ลอง symbol อื่น (เช่น AAPL01) หรือ DR ตัวนั้น delist แล้ว

**Tools ที่ช่วย:**
- Settrade DR screener: https://www.settrade.com/en/equities/market-data/dr
- Yuanta DR detail: https://dr.yuanta.co.th
- Finnomena DR list update: https://www.finnomena.com/definit/all-dr-2025/

### Step 3: เวลาซื้อขาย (Trading Hours)

DR ตามเวลาตลาด SET:
- **ภาคเช้า:** 10:00 — 12:30
- **ภาคบ่าย:** 14:30 — 16:30
- **Pre-open / At-close:** 09:55-10:00, 12:30-12:35, 14:25-14:30, 16:30-16:35

> ราคา DR วิ่งตาม **inAV** (indicative NAV) = อ้างอิงราคาหุ้นต้นฉบับล่าสุด + FX. หุ้นอเมริกาตลาดเปิดกลางคืนเวลาไทย → ตอนเช้าตลาด SET เปิด ราคา DR วิ่งตามราคา US ปิดดึกเมื่อคืน + อาจขยับตาม futures US

### Step 4: ส่งคำสั่งซื้อ

วิธีเดียวกับซื้อหุ้นไทยทุกอย่าง:
- เลือก symbol → กด BUY
- ใส่จำนวน (lot size = **1 หน่วย** ไม่ใช่ 100 หุ้นเหมือนหุ้นไทยหลายตัว — DR lot ปกติ 1)
- ใส่ราคา (Limit) หรือ MP (Market Price)
- Confirm
- รอ matching

### Step 5: Settlement T+2

- ซื้อวันจันทร์ → เงินถูกหักวันพุธ (T+2)
- หุ้นเข้าพอร์ตวันพุธ
- ขายได้เลยตั้งแต่วัน T (Karl กดขายได้ตั้งแต่วินาทีแรกที่ซื้อ matched ถ้า broker อนุญาต — แต่ตามกติกา settlement ก็ T+2)

---

## ส่วนที่ 5: ค่าใช้จ่าย (Cost Breakdown)

**ค่าธรรมเนียมโบรกเกอร์:**
- หุ้นไทย/DR ใช้อัตราเดียวกัน ปกติ 0.157% — 0.25% + VAT 7%
- ตัวอย่าง: ซื้อ DR 50,000 บาท → ค่าธรรมเนียม ~78 บาท + VAT = 84 บาท

**Cost ฝัง (ไม่เห็นใน statement แต่จ่ายจริง):**
- **FX Spread** — ผู้ออก DR แลกเงินที่อัตรา bank rate ไม่ใช่ retail (ราคาห่าง ~0.5-1.5% จาก mid-market)
- **Premium / Discount** — DR อาจซื้อขายราคาต่างจาก inAV (ปกติ ±1-3%)
- **Issuer Fee** — ค่าจัดการของผู้ออก ปกติ 0.3-0.5%/ปี (ฝังในการเคลื่อนของ NAV)

**สรุป all-in cost:** ปีนึงประมาณ 1-2% ของเงินลงทุน (รวม FX + premium + fee)

---

## ส่วนที่ 6: ภาษีปันผล DR

> **DISCLAIMER:** ส่วนนี้สรุปจากความรู้ทั่วไป ไม่ใช่คำปรึกษาภาษี ก่อนยื่นภาษีต้อง consult tax pro หรือโทร rd.go.th hotline 1161

**ปันผลจาก DR หุ้น US (เช่น AAPL19):**
1. Apple จ่าย dividend $1/หุ้น
2. IRS หัก US Withholding Tax 15% (ตาม DTA Thailand-US Article 10 — ผู้ออก DR ใช้ DTA ได้) → เหลือ $0.85
3. ผู้ออก DR เอา $0.85 มาแลกเป็นเงินบาท → โอนเข้าพอร์ต Karl
4. ตอนเงินเข้าบัญชีไทย — เป็น "เงินได้พึงประเมินจากต่างประเทศ" ตาม **มาตรา 40(4)(ข)**
5. Karl ต้อง declare ตอนยื่นภาษีปลายปี (ภงด.90) — เสียภาษีตามอัตราก้าวหน้า bracket 0-35%
6. **เครดิตภาษีต่างประเทศ** — Karl เอา US WHT 15% ที่ถูกหักไปแล้ว มา offset Thai tax ได้ (ตาม DTA Article 23 หรือ 25)

**สำคัญ:**
- final tax 10% ที่ใช้กับหุ้นไทย **ใช้ไม่ได้** กับ DR — เพราะมาตรา 50(2)(จ) บังคับเฉพาะ บจ.ไทย เท่านั้น (อ่านรายละเอียดในไฟล์ 04-tax-comprehensive.md)
- ป.161/2566 บังคับใช้ตั้งแต่ 1 ม.ค. 2567 — เงินได้ต่างประเทศที่นำเข้าไทย ปีไหนเสียภาษีปีนั้น (อ่านไฟล์ 04)

**ถ้า DR ปันผลน้อยมาก (เช่น NVDA dividend yield <0.05%):** ภาษีก็น้อยมาก — เน้น capital gain แทน

**Capital Gain DR:**
- DR เป็น "หลักทรัพย์ที่จดทะเบียนใน SET" → **กำไรจากการขายได้รับยกเว้นภาษี** (ตามกฎหุ้น SET ปกติ)
- จุดนี้ DR ได้เปรียบหุ้น US Direct มาก เพราะ US Direct → กำไร capital gain ต้องเสียภาษีบุคคลในไทย (ป.161/2566)

> **[VERIFY]** การยกเว้นภาษี capital gain ของ DR — ตรวจซ้ำกับ rd.go.th และ broker ว่ายังคงอยู่ในปี 2026 (กฎอาจเปลี่ยน)

---

## ส่วนที่ 7: ข้อจำกัด/ความเสี่ยงของ DR (อย่ามองข้าม)

### 1. Liquidity (สภาพคล่อง)

หลาย DR มี volume น้อย — bid/ask spread กว้าง 1-3%
- ตัวอย่าง: AAPL01 อาจมี volume ~200,000 บาท/วัน
- ถ้า Karl ซื้อ 1 ล้านบาท → impact ราคา + ขายยาก
- **วิธีรับมือ:** เช็ค avg daily volume ก่อนซื้อ, ใช้ Limit order ห้าม Market order, ทยอยซื้อ-ขายช้าๆ

### 2. Premium / Discount (ราคาห่าง NAV)

DR อาจซื้อขายต่างจากราคาจริง (NAV) ในช่วง:
- ตลาดผันผวนรุนแรง (เช่น Trump tariff, Fed surprise) — premium อาจขยับ 5-10%
- อย่าซื้อตอน premium สูง — ขาดทุนทันที

**วิธีเช็ค:** เปรียบเทียบ DR price กับ inAV ที่ broker แสดง (Bualuang แสดง iNAV real-time)

### 3. FX Risk (ความเสี่ยงค่าเงิน)

ราคา DR = ราคาหุ้นต้นฉบับ × FX (USD/THB หรือ HKD/THB)
- USD/THB ขึ้น → DR ขึ้น (USD แข็งค่า ทำให้ DR ราคาเพิ่ม)
- USD/THB ลง → DR ลง (USD อ่อนค่า)
- ดังนั้นแม้ Apple ขึ้น 10% แต่ THB แข็ง 10% → DR อาจไม่เปลี่ยน

> **Karl ต้องคิดเรื่องนี้:** ลงทุน DR US = bet ต่อ USD แข็งค่า + Apple ดี (สอง bet พร้อมกัน)

### 4. Conversion Ratio

DR แต่ละตัวมี ratio ต่างกัน — เช่น:
- 1 AAPL01 อาจ = 1/10 หุ้น Apple จริง
- 1 NVDA19 อาจ = 1/20 หุ้น NVIDIA จริง
- ราคา DR ต่อหน่วย = ราคาหุ้นจริง × ratio × FX

**ทำไมต้องมี ratio?** เพื่อให้ราคา DR ต่อหน่วยอยู่ในช่วงที่ตลาดไทยคุ้น (เช่น 50-500 บาท/หน่วย ไม่ใช่ 7,000 บาท/หน่วยเหมือน Apple จริง)

> เช็ค ratio ก่อนซื้อ ทุกตัว — ratio เปลี่ยนได้ (corporate action) ทำให้ราคา DR ปรับ

### 5. Issuer Risk (ความเสี่ยงผู้ออก)

ถ้า Bualuang/Yuanta/KGI ปิดกิจการ — DR ที่เขาออกอาจหมดความน่าเชื่อถือ
- ปกติเป็น 0% เพราะโบรก major
- แต่ต้องรู้ว่า DR ≠ หุ้นจริง — เป็น "ใบสัญญา" จาก issuer

### 6. Limited Universe

DR มีแค่ ~300 ตัว — ส่วนใหญ่ mega cap
- ถ้า Karl อยากซื้อ small cap US (เช่น Palantir, Crowdstrike, etc.) **อาจไม่มี DR**
- กรณีนั้นต้องไป US Direct (ไฟล์ 03)

### 7. Corporate Action ล่าช้า

หุ้นต้นฉบับมี split / spin-off / merger → ผู้ออก DR ต้องปรับตาม
- บางครั้งล่าช้า 1-2 วัน → ราคาผิดเพี้ยนชั่วคราว
- voting rights ของ Karl ใน DR = แทบไม่มี (ผู้ออก DR vote แทน)

---

## ส่วนที่ 8: Karl Action Plan (ทำอะไรพรุ่งนี้)

### Day 1 (วันนี้)
- [ ] เปิดแอป Streaming/Settrade เช็คว่ามีสิทธิ์เทรด DR หรือยัง
- [ ] ถ้ายัง — กด Service Request เปิดสิทธิ์ + เซ็น risk disclosure
- [ ] เช็คเงินในบัญชี — ตั้งใจ allocate **1,000-5,000 บาท** สำหรับ test trade ครั้งแรก (ห้ามใหญ่)

### Day 2-3 (รอเปิดสิทธิ์)
- [ ] ระหว่างรอ — อ่าน Bualuang knowledge base + ดู settrade DR screener
- [ ] เลือก DR ตัวแรก: **แนะนำ AAPL19 หรือ NVDA19** (liquid สุด, brand รู้จัก, easy to track)
- [ ] เช็ค avg daily volume ใน Streaming ของ symbol ที่เลือก ต้อง > 500,000 บาท/วัน

### Day 4 (Test trade)
- [ ] ส่ง Limit order ซื้อ 1,000-2,000 บาท
- [ ] ราคา Limit = ราคา bid ปัจจุบัน (ห้าม Market)
- [ ] รอ matched
- [ ] สังเกต: ค่าธรรมเนียมจริงที่ถูกหัก, ราคาที่ matched vs iNAV, settlement T+2

### Week 2-4 (Monitor + Learn)
- [ ] เช็คทุกวัน — ราคา DR vs ราคา Apple จริง (Yahoo Finance) — ดูว่า correlation เป็นไง
- [ ] ลองขายส่วนหนึ่งดู — เพื่อรู้สึก slippage จริง
- [ ] บันทึก learning: **liquidity, premium/discount, FX impact**

### Month 2+ (Scale up ถ้าโอเค)
- [ ] ถ้า test trade ไม่มีปัญหา → consider scale ขึ้น (10,000-50,000 บาท)
- [ ] กระจายไป 3-5 DR symbols (AAPL/MSFT/NVDA + SP500 ETF + 1 China/VN)
- [ ] ตั้งวินัย: **DR เป็น stepping stone** — ถ้าขนาดพอร์ตโตเกิน 200,000-500,000 บาท ค่อยพิจารณา US Direct (ไฟล์ 03)

---

## ส่วนที่ 9: When NOT to use DR

DR ไม่ใช่ทางเลือกที่ดีถ้า:
1. **ขนาดเงินใหญ่ (>500,000 บาท)** — premium/FX/issuer fee จะกินกำไรเกินไป → ไป US Direct ดีกว่า
2. **ต้องการ specific stock ที่ไม่มี DR** — เช่น small cap, IPO ใหม่, ETF Ireland-domiciled
3. **ต้องการ options/leverage** — DR ไม่มี options
4. **เน้น dividend สูงๆ** — DR US dividend yield ต่ำ (~1-2%) + จะถูกหักภาษีหลายชั้น
5. **ต้องการ fractional shares** — DR ไม่มี fractional (ต้องซื้อหน่วยเต็ม)
6. **อยากลงทุน Vietnam stocks ที่ ดร.นิเวศน์ ถือ (FPT, MWG ฯลฯ)** — DR VN มีน้อย (แค่ VCB, MWG, FUEVFVND01) → ไป VN Direct ดีกว่า (ไฟล์ 02)

---

## ส่วนที่ 10: เปรียบเทียบ DR vs ทางเลือกอื่น

| เกณฑ์ | DR (SET) | กองทุน B-NIPPON/B-USA | US Direct (IBKR) |
|--------|----------|----------------------|-------------------|
| เปิดบัญชีใหม่ | ❌ ไม่ต้อง | ❌ ไม่ต้อง (ผ่าน bank) | ✓ ต้องเปิด |
| W-8BEN | ❌ ไม่ต้อง | ❌ ไม่ต้อง | ✓ ต้องกรอก |
| เลือกหุ้นเอง | ✓ ได้ | ❌ ไม่ได้ (manager เลือก) | ✓ ได้ + เลือกได้เกือบทุกตัว |
| Capital gain tax | ❌ ยกเว้น (SET listed) | ❌ ยกเว้น (mutual fund) | ✓ ต้องเสีย (ป.161/2566) |
| Dividend tax | ✓ ต้อง declare ภงด.90 | ❌ ไม่ต้อง (กองทุนจัดการ) | ✓ ต้อง declare + ขอ FTC |
| Estate tax US | ❌ ไม่มี (ไม่ใช่ US situs) | ❌ ไม่มี | ✓ มี (>$60K) |
| Cost ปีละ | 1-2% (FX+premium+fee) | 1-2% (mgmt fee) | 0.1-0.3% (เฉพาะ trading) |
| Liquidity | ปานกลาง-น้อย | สูง (NAV ทุกวัน) | สูงมาก (real time) |
| Universe | ~300 symbols | ~50 funds | 5,000+ stocks + options + ETF Ireland |

**สรุปการเลือก:**
- **เริ่มต้น พอร์ตเล็ก (<200K)** → DR ✓
- **passive ไม่อยากเลือกเอง** → กองทุน
- **พอร์ตโต (>500K) อยากตัวเลือกครบ** → US Direct
- **ดร.นิเวศน์ Vietnam style** → VN Direct (ไฟล์ 02)

---

## ส่วนที่ 11: Common Pitfalls (Karl อย่าทำ)

1. **อย่าใช้ Market order** — DR liquid น้อย MP จะกินราคาแย่มาก
2. **อย่าซื้อ DR ตอน 10:00 เปิดตลาด** — premium/discount แกว่งมาก, รอ 10:30+
3. **อย่าซื้อ DR ตัวที่ volume <100,000 บาท/วัน** — ขายไม่ออก
4. **อย่าลืม FX risk** — ดู USD/THB trend ประกอบ ไม่ใช่ดูแค่ Apple
5. **อย่าเอาเงินที่ต้องใช้ใน 6 เดือนมาลง** — DR เหวี่ยงได้ ±20% ใน 1 ปี
6. **อย่ายึด DR เดียวมากกว่า 30%** — กระจาย 3-5 ตัว
7. **อย่าซื้อ DR ผ่าน Pantip recommendation โดยไม่เช็ค** — ดู filing/issuer/iNAV เอง

---

## Summary Card

- **DR คือ:** หุ้นนอกในเสื้อไทย ซื้อขายเป็นเงินบาท ใช้บัญชี SET เดิม
- **เร็วที่สุด:** เปิดสิทธิ์ใน 1-2 วัน → ซื้อตัวแรกได้เลย
- **เหมาะกับ:** Karl เริ่มต้น พอร์ต <200K, อยาก expose US tech
- **ภาษี:** Capital gain ยกเว้น, Dividend ต้อง declare (มาตรา 40(4)(ข))
- **ค่าใช้จ่ายฝัง:** 1-2% ต่อปี (FX + premium + issuer fee)
- **Action:** เปิดสิทธิ์ DR วันนี้ → AAPL19 test 2,000 บาท สัปดาห์หน้า

**ไฟล์ถัดไป:** 02-vietnam-direct.md (ตามแนว ดร.นิเวศน์ — FPT, MWG)

---

## ส่วนที่ 12: DR Deep Dive — กลไกการสร้างราคา (สำหรับคนที่อยากรู้ลึก)

### iNAV (indicative NAV) — ตัวที่ Karl ต้องดูทุกครั้ง

iNAV คือ "ราคาที่ DR ควรจะเป็น" คำนวณจาก:
```
iNAV = ราคาหุ้นต้นฉบับล่าสุด × Conversion Ratio × FX
```

ตัวอย่าง AAPL01:
- Apple ปิดที่ $200 (ตลาดเมื่อคืน NYSE)
- Conversion ratio = 1:10 (1 DR = 1/10 Apple)
- USD/THB = 35.5
- iNAV = 200 × (1/10) × 35.5 = **710 บาท/หน่วย**

ถ้าราคา DR ตลาดอยู่ที่ 720 บาท → premium 10 บาท (1.4%)
ถ้าราคา DR ตลาดอยู่ที่ 700 บาท → discount 10 บาท (-1.4%)

**Karl rule:** อย่าซื้อตอน premium >2% — รอให้ลงมาใกล้ iNAV

### Market Maker Mechanics

Bualuang/Yuanta/KGI มีหน้าที่ "ทำตลาด" (market maker) สำหรับ DR ตัวเอง — คือคอยตั้ง bid/ask ให้ราคาใกล้ iNAV

แต่ถ้า:
- ตลาด US เปิดดึก (เวลาไทย 21:30-04:00) → ตลาดไทยปิด → MM ใช้ futures US เป็น proxy
- หุ้นต้นฉบับ halt/limit-down → MM อาจไม่ตั้งราคา → spread กว้างผิดปกติ
- volume น้อย → spread กว้าง 1-3% เป็นปกติ

### Arbitrage Pressure

ทำไม DR ราคาไม่ห่าง iNAV มาก? เพราะ:
- ถ้า DR premium สูงเกิน → arbitrageur ขาย DR + ซื้อหุ้นต้นฉบับ
- ถ้า DR discount สูงเกิน → arbitrageur ซื้อ DR + ขายหุ้นต้นฉบับ
- Process นี้ดึงราคา DR กลับใกล้ iNAV
- แต่ retail Karl ทำ arbitrage ไม่ได้ (cost สูง, ต้องมีบัญชีหลายฝั่ง) — ปล่อยให้ MM ทำ

---

## ส่วนที่ 13: Tax Examples — DR Real Cases (สำหรับ Karl)

> Disclaimer: ตัวอย่างนี้สมมติ — ก่อนยื่นจริงต้อง consult tax pro

### Case 1: Karl ซื้อ AAPL19 → ได้ปันผล

- ลงทุน: 100,000 บาท ใน AAPL19 ปลายปี 2025
- ปี 2026 Apple จ่าย dividend $1.04/หุ้น (yield ~0.5%)
- เทียบเป็นเงินบาท: 100,000 × 0.005 = ~500 บาท ต่อปี (ก่อนภาษี)
- US WHT 15% → เหลือ ~425 บาท เข้าพอร์ต
- Karl ต้อง declare 500 บาท ใน ภงด.90 ปี 2026
- ภาษีเพิ่ม Thai bracket (สมมติ Karl อยู่ bracket 20%) → 100 บาท
- Foreign Tax Credit (US WHT 75 บาท) → offset → Karl จ่าย Thai tax = 25 บาท
- **Net dividend received: ~400 บาท**
- ผลกระทบต่อพอร์ต: เล็กมาก (0.4%) — dividend tax ของ DR US ไม่ใช่เรื่องน่ากังวล

### Case 2: Karl ขาย AAPL19 มีกำไร

- ลงทุน 100,000 บาท → 1 ปีต่อมาราคาขึ้น 30% → ขายได้ 130,000 บาท
- กำไร 30,000 บาท
- **DR เป็น SET listed → capital gain ยกเว้นภาษี (มาตรา 42(17))** [VERIFY: rd.go.th]
- ค่า commission ขาย ~205 บาท (0.157%)
- **Net profit: ~29,800 บาท** (ไม่ต้องเสียภาษีเพิ่ม)

### Case 3: Karl ขาย AAPL19 ขาดทุน

- ลงทุน 100,000 บาท → Apple ลง 20% → ขายได้ 80,000 บาท
- ขาดทุน 20,000 บาท
- DR ขาดทุน **ไม่สามารถนำไป offset กำไรอื่นได้** (เพราะกำไรเดิมก็ยกเว้นภาษีอยู่แล้ว)
- ค่า commission ขาย ~125 บาท
- **Net loss: 20,125 บาท** — รับเองหมด

---

## ส่วนที่ 14: คำถามที่ Karl อาจถาม (FAQ)

**Q1: DR กับ NVDR ต่างกันยังไง?**
- NVDR = Non-Voting Depositary Receipt → ออกโดย SET → ใช้กับหุ้นไทย
- DR = Depositary Receipt → ออกโดยโบรกเกอร์ → ใช้กับหุ้นต่างประเทศ
- คนละเรื่องกันโดยสมบูรณ์

**Q2: ถ้า Bualuang เลิกออก DR ตัวที่ Karl ถือ จะเกิดอะไร?**
- Issuer ปกติประกาศ delist ล่วงหน้า 30-90 วัน
- Karl มี 2 ทางเลือก: (1) ขายในตลาดก่อน delist (2) แลกคืนเป็นหุ้นจริงผ่าน issuer (ต้องมีบัญชี US)
- ปกติแนะนำขายก่อน delist เพราะการแลกคืนยุ่งยาก

**Q3: ทำไมราคา DR ไม่ตรงกับราคาหุ้น Apple ที่เห็นใน Yahoo?**
- เพราะ DR ราคา = หุ้นจริง × ratio × FX
- Yahoo แสดงราคา Apple จริง (USD ต่อหุ้นเต็ม)
- ต้องเอา ratio + FX มาคำนวณก่อนเทียบ

**Q4: DR มี dividend reinvestment plan (DRIP) ไหม?**
- ไม่มี — เงินปันผลจะถูกโอนเข้าบัญชีเงินสดของ Karl (เป็นเงินบาท)
- ถ้าอยาก reinvest ต้องกดซื้อ DR เพิ่มเอง

**Q5: ถ้า Apple stock split (เช่น 2:1) — DR จะปรับยังไง?**
- Issuer จะปรับ ratio ให้ตามอัตโนมัติ (เช่นจาก 1:10 → 1:5)
- จำนวน DR ของ Karl ไม่เปลี่ยน แต่ละหน่วยมีมูลค่าเท่าเดิม
- ราคา DR อาจปรับเล็กน้อย (corporate action)

**Q6: DR ESG/sustainable มีไหม?**
- มี — เช่น DR ที่ tracking ETF ESG (แต่ list ไม่ครบ)
- ถ้าเน้น ESG → ดีกว่าไป US Direct ซื้อ ETF ESG อย่าง ESGV หรือ DSI

**Q7: ขาย DR แล้วเสีย stamp duty ไหม?**
- ไม่มี — DR ในไทยไม่มี stamp duty (ต่างจาก HK/SG)

**Q8: เปิดบัญชี DR เด็กให้ลูกได้ไหม?**
- ได้ — ทำเหมือนเปิดบัญชีหุ้นเด็ก (ผู้ปกครองจัดการ)
- ภาษี dividend ของเด็ก = บัญชีเด็ก declare เอง

**Q9: ถ้า Karl ออกนอกประเทศไทย (ไป Thailand non-resident) — DR ยังถือได้ไหม?**
- ได้ — บัญชีไม่ปิด แต่จะกลายเป็น non-resident account
- อาจมีข้อจำกัดในการ deposit/withdraw บางอย่าง
- แนะนำ consult broker ก่อน

**Q10: AI hallucination — ตัวเลขในเอกสารนี้เชื่อได้ 100% ไหม?**
- **ไม่ได้** — เอกสารนี้สร้างจาก AI ใน April 2026 ตัวเลขกฎหมาย/ภาษีอาจเปลี่ยน ตลอดเวลา
- ก่อนใช้จริงต้องเช็ค: rd.go.th hotline 1161, broker official site, settrade.com
- ทุกอย่างที่มี [VERIFY] flag คือต้องเช็คเพิ่ม

---

## ส่วนที่ 15: Resources & Next Steps

### Bookmarks ที่ Karl ควรเก็บ

- **SET DR overview:** https://www.set.or.th/en/market/product/dr/overview
- **Settrade DR data:** https://www.settrade.com/en/equities/market-data/dr
- **Bualuang knowledge:** https://knowledge.bualuang.co.th/knowledge-base/what-dr/
- **Yuanta DR detail:** https://dr.yuanta.co.th
- **Finnomena update list:** https://www.finnomena.com/definit/all-dr-2025/
- **rd.go.th hotline:** 1161 (ภาษี)

### Learning Path (4 weeks)

- **Week 1:** อ่านเอกสารนี้ + เปิดสิทธิ์เทรด DR + paper trade (ไม่ลงเงินจริง) ใน Streaming
- **Week 2:** Test trade 1,000-2,000 บาท ใน AAPL19 → ดู mechanics จริง
- **Week 3:** เพิ่ม DR ตัวที่ 2-3 (NVDA19 + SP500US19) → กระจาย 3 ตัว
- **Week 4:** เริ่มอ่าน 02-vietnam-direct.md (ขั้นต่อไปตามแนว ดร.นิเวศน์)

### When to Graduate from DR

- พอร์ต DR > 200,000 บาท → consider US Direct (ไฟล์ 03)
- ปันผลรวม > 30,000 บาท/ปี → consider Holding Company คิดบ้าง (ไฟล์ 05)
- ถือ >5 DR symbols + ตามตลาดต่างประเทศแบบจริงจัง → ขั้นต่อไปคือเปิด IBKR

---

## Final Checklist (ก่อน Karl เริ่มซื้อ DR ตัวแรก)

- [ ] อ่านเอกสารนี้ครบ
- [ ] รู้ว่า DR คืออะไร (ส่วน 1)
- [ ] เปิดสิทธิ์เทรด DR ในแอปแล้ว (ส่วน 4 Step 1)
- [ ] เลือก symbol แรก (แนะนำ AAPL19 หรือ NVDA19)
- [ ] เช็ค avg daily volume > 500,000 บาท/วัน
- [ ] รู้เวลาซื้อขาย (10:00-12:30, 14:30-16:30)
- [ ] เข้าใจ iNAV/premium (ส่วน 12)
- [ ] เข้าใจภาษี: capital gain ยกเว้น, dividend ต้อง declare (ส่วน 6 + 13)
- [ ] เตรียมเงิน test trade 1,000-2,000 บาท (ห้ามใหญ่ครั้งแรก)
- [ ] รู้ pitfalls (ส่วน 11) — ห้ามใช้ Market order
- [ ] Bookmark resources ส่วน 15

ถ้าทำ checklist นี้ครบ → Karl พร้อมซื้อ DR ตัวแรกในชีวิต **ตั้งแต่พรุ่งนี้**

---

## Appendix A: DR vs Mutual Fund (Side-by-Side ลึก)

ถ้า Karl ลังเลระหว่าง DR กับซื้อกองทุน B-USA/B-NIPPON/K-USA — รายละเอียด:

**ความเป็นเจ้าของ:**
- DR: มีสิทธิ์ในหุ้นเฉพาะตัว (Karl เลือก Apple = ได้ Apple)
- Fund: ผู้จัดการเลือก — Karl ได้กลุ่มหุ้น 50-100 ตัวที่ผจก. ตัดสินใจ

**ความโปร่งใส:**
- DR: Real-time price + iNAV + ratio + FX แสดงในแอป
- Fund: NAV ปลายวัน + portfolio composition update รายเดือน/ไตรมาส

**Cost:**
- DR: 0.157-0.25% trading commission + 0.3-0.5% issuer fee + FX spread
- Fund: 1.5-2.5% management fee + 0.5-1% sales charge (บางกองทุน)
- **Net advantage:** DR ถูกกว่า ถ้าซื้อแล้วถือยาว 2+ ปี

**Liquidity:**
- DR: ขายในตลาดได้เลย (instant)
- Fund: T+5 ขึ้นไปกว่าจะได้เงิน

**Tax:**
- DR: capital gain ยกเว้น (SET listed) + dividend ต้อง declare
- Fund: capital gain ยกเว้น (LTF/RMF/SSF บางกองมี extra tax saving) + dividend ส่วนใหญ่ reinvest อัตโนมัติ

**Risk Diversification:**
- DR: Karl เลือกเอง อาจกระจุก (1-3 ตัว) → high single stock risk
- Fund: กระจาย 50-100 ตัวอัตโนมัติ → lower single stock risk

**Karl's choice rule:**
- ถ้า Karl เชื่อว่าตัวเองเลือกหุ้นได้ดีกว่า MSCI/S&P → DR
- ถ้า Karl ยอมรับว่าผจก. กองดีกว่า + อยาก passive → Fund
- ถ้าเงินน้อย <50,000 บาท + อยาก diversify → Fund
- ถ้าเงินมาก + อยาก control → DR หรือ US Direct

---

## Appendix B: Common DR Buying Mistakes (เรียนจากคนอื่น)

จากการสำรวจประสบการณ์นักลงทุนใน Pantip + Facebook DR investor groups:

**Mistake 1: ซื้อ DR ตอน Apple ขึ้นแรงๆ ในข่าว**
- Apple ประกาศ earnings beat ตอน 04:30 — 09:00 มีคนแห่ซื้อ DR ที่ 10:00 เปิดตลาด
- ผลคือ premium พุ่ง 3-5% — ซื้อ "บนยอด"
- **บทเรียน:** รอ 30 นาทีหลังเปิดตลาด, ดู iNAV ตั้งใจ

**Mistake 2: ใช้ Market order ใน DR ที่ volume น้อย**
- กด MP ใน BABA80 ที่ volume <50,000 บาท/วัน
- Order matched ที่ราคา 10% สูงกว่า bid → ขาดทุน slippage ทันที
- **บทเรียน:** Limit order ทุกครั้ง

**Mistake 3: ไม่เข้าใจ ratio**
- เห็น Apple ราคา $200 → คิดว่า DR ต้อง 7,000 บาท
- จริงๆ DR ratio 1:10 = ราคา ~700 บาท
- ซื้อจำนวนหน่วยผิด — ตั้งใจซื้อ 1 ล้านบาท แต่กดเป็น 10 ล้าน
- **บทเรียน:** อ่าน fact sheet DR ก่อนซื้อทุกตัว

**Mistake 4: ลืม FX trend**
- ซื้อ AAPL01 ตอน USD/THB 36 → 6 เดือนต่อมา USD/THB ลงมา 33
- Apple ขึ้น 5% แต่ DR ขึ้นแค่ 0.5% เพราะ FX กิน
- **บทเรียน:** macro view ของ FX สำคัญพอๆ กับ stock view

**Mistake 5: ไม่ตามข่าว corporate action**
- Apple ประกาศ stock split 4:1 — ratio DR ปรับจาก 1:10 → 1:2.5
- Karl ไม่รู้ → ขาย "ผิดราคา"
- **บทเรียน:** subscribe broker email + ตามข่าวบริษัทต้นฉบับ

**Mistake 6: ถือ DR 1 ตัวมากเกิน**
- คนใส่ 80% พอร์ตใน NVDA19 — ตอน NVIDIA ตก 30% → พอร์ตหายไป 24%
- **บทเรียน:** กฎ 30% — DR ตัวเดียวห้ามเกิน 30% พอร์ต

**Mistake 7: ลืม declare dividend ภงด.90**
- คิดว่า DR เหมือนหุ้นไทย → final tax 10% — ผิด!
- DR ปันผลต้อง declare ตามมาตรา 40(4)(ข)
- **บทเรียน:** เก็บ statement ปันผล DR ไว้ทุกใบ ใช้ตอนยื่นภาษี

---

## Appendix C: Glossary (ศัพท์ที่ Karl ต้องรู้)

| ศัพท์ | ความหมาย |
|------|----------|
| DR | Depositary Receipt — ตราสารแสดงสิทธิการฝากหลักทรัพย์ตปท. |
| iNAV | indicative NAV — มูลค่าทรัพย์สินสุทธิที่คำนวณจากหุ้นต้นฉบับ × ratio × FX |
| Issuer | ผู้ออก DR (Bualuang/Yuanta/KGI/etc.) |
| Conversion Ratio | อัตราส่วน DR : หุ้นต้นฉบับ (เช่น 1:10) |
| Premium | ราคา DR สูงกว่า iNAV |
| Discount | ราคา DR ต่ำกว่า iNAV |
| Underlying | หุ้นต้นฉบับ (เช่น Apple stock จริง) |
| Custody | ผู้รับฝากหุ้น (มักเป็น bank ในประเทศต้นทาง) |
| Market Maker | ผู้ทำตลาด — issuer ที่ตั้ง bid/ask ใกล้ iNAV |
| WHT | Withholding Tax — ภาษีหัก ณ ที่จ่าย |
| FTC | Foreign Tax Credit — เครดิตภาษีต่างประเทศ |
| DTA | Double Tax Agreement — สนธิสัญญาภาษีซ้อน |
| FX Spread | ส่วนต่างอัตราแลกเปลี่ยน bid-ask |
| Stamp Duty | อากรแสตมป์ (DR ไทยไม่มี) |
| T+2 | settlement ใน 2 วันทำการ |
| iSign / DRx | DR ที่ซื้อขายแบบ fractional ใน SET (รุ่นใหม่) |
