# Research: Thai Stock Data Sources — Empirical Comparison

> Date: 2026-04-23
> Mode: full (hands-on test + codebase analysis)
> Project: MaxMahon
> Author: Karl (AI) + empirical test on live APIs

---

## 1. Summary

- **thaifin คือผู้ชนะชัดเจน** สำหรับ Thai fundamentals — 16 ปี annual + 66 ไตรมาส + 36 columns + SET official sector taxonomy + 933 stock universe ทั้งหมด speed 0.3-0.9s/stock
- **yfinance Thai .BK มีปัญหาจริง** — fundamentals 4-5 ปีเท่านั้น (thaifin 16 ปี), sector ใช้ GICS-style ฝรั่ง ("Consumer Defensive") ไม่ใช่ SET taxonomy ("Commerce") — ไม่ match กับ mental model ของ ดร.นิเวศน์
- **yahooquery ดีกว่า yfinance สำหรับ historical** — IS rows 13-15 (ลึกกว่า yfinance 4-5 ปี), CF rows 5-8 — ใช้ parser คนละตัวกับ yfinance แต่ endpoint เดียวกัน แม้ sector ยังเป็น GICS-style
- **investpy พัง** — `ModuleNotFoundError: pkg_resources` บน Python 3.12+ และยังติด Cloudflare DDoS guard ตั้งแต่ 2021 → ตัดทิ้ง
- **stooq พัง** — `.TH` suffix ไม่มี Thai stock data หรือ path ผิด → ตัดทิ้ง
- **MaxMahon ใช้ thaifin ไม่เต็มความสามารถ** — มี 36 columns แต่ใช้แค่ ~22 ตัว ที่เหลือมีค่า เช่น `ev_per_ebit_da`, `cash`, `roa`, `revenue_yoy`, `cash_cycle`

---

## 2. Findings

### 2.1 thaifin 1.1.0 (winner)

**Test:** `Stock(sym).yearly_dataframe` + `.quarter_dataframe` + `Stocks().list_with_names()`

**Universe:** 933 symbols (SET 704 + mai 229) — ตรงกับ `set_universe.json`

**Speed:** 0.29-0.94 seconds per stock (เร็วสุดใน lot ทดสอบ)

**Fundamentals depth:**
- Annual: **16 ปี** (2010-2025) — stocks ส่วนใหญ่; MC = 14 ปี (IPO ใหม่กว่า)
- Quarterly: **66 quarters** = 16.5 ปี
- ทุกตัวในพอร์ต ดร.นิเวศน์ (CPALL/TCAP/QH/BCP/MC) = 14-16 ปี full

**36 columns ที่ได้:**
```
cash, da, debt_to_equity, equity, earning_per_share, earning_per_share_yoy, earning_per_share_qoq,
gpm, gross_profit, net_profit, net_profit_yoy, net_profit_qoq, npm, revenue, revenue_yoy, revenue_qoq,
roa, roe, sga, sga_per_revenue, total_debt, dividend_yield, book_value_per_share, close, mkt_cap,
price_earning_ratio, price_book_value, ev_per_ebit_da, ebit_dattm, paid_up_capital, cash_cycle,
operating_activities, investing_activities, financing_activities, asset, end_of_year_date
```

**Sector = SET official taxonomy (28 sectors, 9 industries):**
- CPALL → Commerce / Services
- TCAP → Banking / Financials
- QH → Property Development / Property & Construction
- BCP → Energy & Utilities / Resources
- MC → Commerce / Services (ซ้ำ CPALL ที่ sector level!)
- ADVANC → Information & Communication Technology / Technology
- PTT → Energy & Utilities / Resources

**ผลตัวอย่าง CPALL ปี 2025 (latest):**
```
close=43.5  pe=14.48  dy%=3.00  roe=21.29
ev_ebitda=8.57  revenue=990.6B  net_profit=28.2B  de=1.96
```

**ข้อจำกัด:**
- ไม่มี raw DPS events (มีแค่ yield% ต่อปี) — ต้อง derive จาก yield×close
- ไม่มี capex แยก (มีแค่ `investing_activities` รวม)
- ไม่มี interest_expense
- ไม่มี operating_income แยกชัด (มี `gross_profit` + `sga` ต้อง compute เอง)
- Real-time price ไม่ใช่ — เป็นราคาปิดสิ้นปี

---

### 2.2 yfinance 1.2.1 (current supplement — มีปัญหาตามคาด)

**Speed:** 0.96-1.54 seconds per stock

**Fundamentals depth (Thai .BK):**
- IS years: **4-5 เท่านั้น** (vs thaifin 16)
- BS years: 5
- CF years: 4-5
- Price history 10y: 2427 rows ✅ ครบ

**Sector = GICS-style (US-centric):**
| Stock | yfinance | thaifin SET |
|---|---|---|
| CPALL | Consumer Defensive / Grocery Stores | Commerce / Services |
| TCAP | Financial Services / Credit Services | Banking / Financials |
| QH | Real Estate / Real Estate - Development | Property Development / Property & Construction |
| BCP | Energy / Oil & Gas Refining & Marketing | Energy & Utilities / Resources |
| MC | Consumer Cyclical / Apparel Manufacturing | Commerce / Services |
| ADVANC | Communication Services / Telecom Services | Information & Communication Technology / Technology |
| PTT | Energy / Oil & Gas Integrated | Energy & Utilities / Resources |

**ข้อสังเกตสำคัญ:** yfinance แยก CPALL=Consumer Defensive vs MC=Consumer Cyclical (ตาม business line) = **ใกล้ mental model ดร.นิเวศน์ที่นับ "สะดวกซื้อ vs เสื้อผ้า" เป็นคนละ sector** มากกว่า SET taxonomy ที่ยัด 2 ตัวเข้า Commerce เดียวกัน

→ **implication สำหรับ feature "จัดพอร์ตสไตล์แมกซ์":** อาจต้องพิจารณาใช้ GICS-style sector เป็น fallback/supplement เพื่อ diversify ให้ได้ 5 sector business-line แทน SET taxonomy

**Dividends:**
- CPALL: 24 events, 21 ปี span
- TCAP: 47 events, 23 ปี span
- ADVANC: 50 events, 25 ปี span
- PTT: 45 events, 24 ปี span
- **= raw DPS history ที่ thaifin ไม่มี** — ยังจำเป็นสำหรับ DPS as source of truth

**ปัญหาที่ยืนยัน:**
- ✅ Fundamentals ตื้น (4-5 ปี) → `_fetch_yfinance_legacy` fallback ใน MaxMahon จะแย่กว่า primary path
- ✅ Sector taxonomy ไม่ใช่ SET → ไม่ควรใช้สำหรับ Thai portfolio construction ตามหลัก ดร.นิเวศน์
- Info fields เยอะ (152-164) แต่หลายตัว stale/null (ตาม code comment `data_adapter.py:339` `len(info) < 5` guard)

---

### 2.3 yahooquery 2.4.1 (ทางเลือกแทน yfinance)

**Speed:** 2.32-3.12 seconds per stock (ช้ากว่า yfinance ~2x)

**Fundamentals depth:**
- IS rows: **13-15** (**ลึกกว่า yfinance 4-5 ปี อย่างชัดเจน**)
- BS rows: 5 (เท่า yfinance)
- CF rows: 5-8 (ดีกว่า yfinance นิดหน่อย)
- History (price): 2427 rows = เท่า yfinance

**Sector = GICS เหมือน yfinance** (ใช้ endpoint เดียวกับ Yahoo)

**ผลตัวอย่าง CPALL:**
```
IS rows: 15 (vs yfinance 5)  BS: 5  CF: 5
PE=14.76  DY=0.0361 (= 3.61%)  mcap=407.9B
```

**หมายเหตุ:** IS rows 13-15 มาจาก mix ของ quarterly + TTM — `frequency='a'` แล้วยังได้เยอะขนาดนี้ อาจจะ duplicate header row หรือ include TTM rolling ที่ yfinance ไม่ return กลับมา → ต้องเช็คโครงสร้างจริงถ้าจะใช้ production

**ข้อดีทาง tech:**
- Batch request — `Ticker(['CPALL.BK','TCAP.BK',...])` เรียกครั้งเดียวหลายตัว = ดีกว่า yfinance loop
- API stable กว่า yfinance (yfinance พังบ่อยจาก Yahoo update)
- แต่ sector ยัง GICS ไม่ใช่ SET

---

### 2.4 investpy 1.0.8 (พัง — ตัดทิ้ง)

```
INVESTPY top-level FAILED: ModuleNotFoundError: No module named 'pkg_resources'
```

**สาเหตุ:** setuptools ถูกถอดจาก Python 3.12+ standard → `pkg_resources` หายไป investpy ยังใช้ API เก่า

**แม้ fix ได้:** investpy ถูก Cloudflare DDoS guard ของ investing.com block มาตั้งแต่ 2021 — known dead (GitHub issues ยืนยันจำนวนมาก)

**Verdict:** ❌ ห้ามใช้

---

### 2.5 pandas_datareader stooq (พัง — ตัดทิ้ง)

```
CPALL.TH FAILED: ParserError: Error tokenizing data. C error: Expected 1 fields in line 6, saw 2
```

**สาเหตุ:** Stooq คืน error HTML/CSV แทนข้อมูลจริง — `.TH` suffix ไม่ valid บน Stooq หรือ Thai stocks ไม่อยู่ใน coverage

ทดลอง path อื่น (เช่น `CPALL.BK`, `CPALL:TH`) ไม่ได้ในรอบนี้ แต่ stooq เป็น source รองอยู่แล้ว

**Verdict:** ❌ ไม่ reliable

---

### 2.6 Paid sources (ไม่ได้ทดสอบรอบนี้ — web research agent ไม่ส่ง final report)

สิ่งที่ต้องวิจัยเพิ่มในรอบถัดไป (ถ้าต้องการ):
- **EODHD** — Thai SET coverage, fundamentals depth, cost
- **SETSMART API** (official) — B2B subscription, cost, coverage
- **FinancialModelingPrep** — Thai availability
- **Twelve Data** — Thai availability
- **Alpha Vantage** — Thai coverage
- **Finnhub** — Thai coverage
- **Settrade API** (broker) — requires account

**Gap:** ยังไม่รู้ว่า paid source ตัวไหนมี Thai depth เหนือกว่า thaifin หรือไม่ — รอบนี้ไม่ได้เช็ค

---

## 3. Fields MaxMahon กำลัง "พลาด" จาก thaifin

MaxMahon ใช้ thaifin ไม่เต็ม — จาก 36 columns ใช้จริงประมาณ 22 ตัว ที่เหลือ 14 ตัวยังไม่ได้แตะ:

| Column | ค่าล่าสุด CPALL | Use case |
|---|---|---|
| `cash` | 53.2B | Balance sheet strength / dividend safety |
| `ev_per_ebit_da` | 8.57 | **MaxMahon compute เอง — ใช้ thaifin ตรงๆ ได้!** (quality_score EV/EBITDA bucket) |
| `roa` | 2.93% | Complement to ROE (ดูว่าใช้หนี้ดึง ROE ขึ้นหรือเปล่า) |
| `earning_per_share_yoy` | 11.91% | EPS growth trend (momentum signal) |
| `revenue_yoy` | 3.30% | Top-line growth trend |
| `net_profit_yoy` | 11.28% | Bottom-line growth trend |
| `cash_cycle` | -25.5 days | Working capital efficiency |
| `financing_activities` | -38.4B | Capital structure changes (buyback / dividend / debt) |
| `sga_per_revenue` | 20.5% | Cost discipline |
| `asset` | 982.8B | Size + leverage analysis |
| `ebit_dattm` | None (มักว่าง) | TTM EBITDA (ถ้ามีค่า) |
| `paid_up_capital` | None (มักว่าง) | Corporate action signal |

**ข้อแนะนำ:** `ev_per_ebit_da` ที่ thaifin ให้มาโดยตรง ใช้แทน MaxMahon's current self-computed EV/EBITDA ได้เลย — ลดข้อผิดพลาดจาก formula

---

## 4. Comparison Matrix

| Metric | thaifin | yfinance | yahooquery | investpy | stooq |
|---|---|---|---|---|---|
| Universe (SET+mai) | **933** ✅ | .BK ticker ละตัว | .BK ticker ละตัว | Thai list | N/A |
| IS years | **16** ✅ | 4-5 | 13-15 | — | — |
| BS years | 16 ✅ | 5 | 5 | — | — |
| CF years | 16 ✅ (แบบ 3 flows รวม) | 4-5 | 5-8 | — | — |
| Quarterly | **66** ✅ | 5 | 10+ | — | — |
| Sector taxonomy | **SET official** ✅ | GICS (US) | GICS (US) | — | — |
| Raw DPS events | ❌ (yield% only) | ✅ 20-50 events | ✅ | — | — |
| Capex split | ❌ | ✅ (short history) | ✅ | — | — |
| Interest expense | ❌ | ✅ (short history) | ✅ | — | — |
| Real-time price | ❌ | ✅ | ✅ | — | — |
| 52w high/low | ❌ | ✅ | ✅ | — | — |
| Forward PE | ❌ | ✅ | ✅ | — | — |
| Speed/stock | **0.3-0.9s** ✅ | 1.0-1.5s | 2.3-3.1s | ❌ crashed | ❌ crashed |
| API stability | ✅ | ⚠️ (Yahoo updates) | ✅ | ❌ dead | ❌ dead |
| Cost | Free | Free | Free | Free (dead) | Free (dead) |

---

## 5. Recommendation

### 5.1 Stay the course — thaifin primary + Yahoo supplement

- **thaifin คือของจริง** สำหรับ Thai fundamentals และต้องเป็น primary ต่อ — 16 ปี + SET sector + 933 stocks เหนือกว่าฟรี tool ทั้งหมด
- **ไม่ต้องเปลี่ยนแหล่ง** — ที่ Karl กังวลว่า "yfinance ไม่แน่น" มีมูลจริง แต่ MaxMahon ใช้ yfinance เฉพาะจุดที่ thaifin ไม่ให้ (price real-time, 52w, capex, interest_expense, raw DPS) ซึ่ง source อื่น (ฟรี) ก็ไม่มีให้ดีกว่า

### 5.2 Action items (ลด pain point จากผลการวิจัย)

1. **เลิกใช้ yfinance สำหรับ `sector` / `industry`** — ใช้ thaifin's SET taxonomy เท่านั้น (หน้า `scan.py:727,746,810` + `screen_stocks.py:557`)
2. **เพิ่ม GICS-style sector เป็น fallback metadata** — ใช้สำหรับ diversification check (เช่น CPALL+MC ถ้ายึด SET sector จะซ้ำ Commerce, ถ้ายึด GICS จะแยก Consumer Defensive / Cyclical)
3. **ใช้ thaifin `ev_per_ebit_da` แทน self-computed** — ลด computation error
4. **เพิ่ม thaifin columns ที่ยังไม่ใช้** เช่น `cash`, `roa`, `revenue_yoy`, `cash_cycle`, `sga_per_revenue` → ขยาย quality_score หรือ signal detection
5. **ทดสอบ yahooquery แทน yfinance** สำหรับ supplement path — ถ้าได้ IS 13-15 rows จริง (ไม่ใช่ quarterly dup) จะลด dependency ต่อ thaifin สำหรับ capex/OI/interest_expense ได้
6. **ลบ investpy และ stooq ออกจากพิจารณา** — dead

### 5.3 Paid source research — ควรทำต่อถ้า scale

ถ้า MaxMahon ขึ้น production live / commercial:
- เช็ค **EODHD** Thai fundamentals depth + cost (น่าจะ $20-80/month)
- เช็ค **SETSMART** official (B2B, ราคาแพงกว่าเยอะ)
- ประเมิน switching cost vs thaifin (ฟรี + ดี + อาจถูก rate-limit ถ้าใช้เยอะ)

---

## 6. Empirical Test Evidence

**Test script:** `_shared/tmp/test_thai_data_sources.py` (7 stocks × 5 libraries)

**Raw output ตัดบางส่วนมาเป็นหลักฐาน:**

```
THAIFIN:
  CPALL [0.58s]  sector: Commerce  industry: Services  years: 16  quarters: 66
  TCAP  [0.31s]  sector: Banking   industry: Financials  years: 16  quarters: 66
  ADVANC[0.39s]  sector: Information & Communication Technology  years: 16  quarters: 66

YFINANCE:
  CPALL.BK [1.54s]  sector: Consumer Defensive  IS: 5  BS: 5  CF: 4  divs: 24 events
  TCAP.BK  [1.07s]  sector: Financial Services  IS: 5  BS: 5  CF: 5  divs: 47 events

YAHOOQUERY:
  CPALL.BK [2.67s]  sector: Consumer Defensive  IS: 15  BS: 5  CF: 5
  TCAP.BK  [2.56s]  sector: Financial Services  IS: 15  BS: 5  CF: 7

INVESTPY: FAILED (ModuleNotFoundError)
STOOQ:    FAILED (ParserError)
```

---

## 7. References

| What | Path / URL |
|------|-----------|
| Test script | `_shared/tmp/test_thai_data_sources.py` |
| Current integration | `projects/MaxMahon/scripts/data_adapter.py`, `scripts/fetch_data.py` |
| MaxMahon CLAUDE.md (Data Source Invariants) | `projects/MaxMahon/CLAUDE.md:22-46` |
| thaifin PyPI | https://pypi.org/project/thaifin/ |
| thaifin GitHub | https://github.com/CircleOnCircles/thaifin |
| yahooquery docs | https://yahooquery.dpguthrie.com/ |
| SET official sector taxonomy | 9 industries / 28 sectors (via thaifin `Stocks().list_with_names()`) |

---

## 8. Gaps / Limitations ของ research รอบนี้

- **ไม่ได้เช็ค paid sources** (EODHD, SETSMART, Alpha Vantage, FMP) — agent web research ไม่ส่ง final report กลับ
- **ไม่ได้ทดสอบ rate limit** ของ thaifin + yahooquery บน 933 stocks พร้อมกัน — เฉพาะ 7 stocks
- **ไม่ได้เช็ค data freshness** ว่า thaifin update ทัน annual report เมื่อไหร่ (lag กี่วัน)
- **ไม่ได้ verify IS rows 13-15 ของ yahooquery** ว่าเป็น quarterly dup หรือ annual ที่ลึกจริง
- **ไม่ได้เทียบกับของจริง** — ตัวเลขจาก thaifin vs SET Link official vs รายงานประจำปีของบริษัทฉบับจริง (sanity audit)
