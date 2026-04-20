# 00-research-rules.md — Verbatim Quote Rule (Anti-Hallucination)

> **Authority:** every file in `docs/niwes/` (01–12 + 00-index) MUST follow these 5 rules.
> **Reason:** Karl is using Dr. Niwes as a 100% role model. Fake quotes attributed to him will mislead actual investment decisions and corrupt the MaxMahon agent's training data downstream.

---

## Rule 1 — Verbatim Only

Every quoted statement attributed to Dr. Niwes must be **exact text** copied from a source the researcher has actually fetched.

- **Allowed:** "เลือกหุ้นที่ปัจจุบันจ่ายปันผลตอบแทนอย่างน้อย 5% ต่อปีขึ้นไป"
- **Forbidden:** "Dr. Niwes once said something like 'pick high-dividend stocks'"
- **Forbidden:** Translating his words back into Thai, then quoting that retranslation.

If the source is in English (rare) → keep English; do NOT back-translate to Thai and quote.

---

## Rule 2 — Source Stamp Required

Every quote must be followed (or preceded) by:

- URL of the source
- Publish date (Thai BE or Gregorian, whichever the source uses)
- Outlet / interviewer / author / show name
- (Optional) timestamp if YouTube/audio source

**Format example:**

> "ในวิกฤติมีโอกาส" — ดร.นิเวศน์, *30 ปีในตลาดหุ้น*, Finnomena, 14 ก.พ. 2560 — https://www.finnomena.com/dr-niwes/30-years-in-stock-market/

---

## Rule 3 — No Niwes-Sounding Inventions

Do **not** fabricate sentences that sound like something Niwes would say. Common temptations to avoid:

- Generic VI mottos like "ลงทุนอย่างมีเหตุผล" without source
- Composite quotes stitched from multiple sources
- "Translations" that subtly add or remove meaning

If you have the *idea* but no *exact wording*, write it as plain narrative — never as a quoted statement.

---

## Rule 4 — Paraphrase Marker

If a fact comes from a source but is not a verbatim quote, label it explicitly:

- "(paraphrase from {URL})"
- "(สรุปจาก {ชื่อสื่อ}, {วันที่} — {URL})"

Paraphrases are allowed and encouraged for biography facts, dates, share counts, and event narratives — anything that is factual rather than rhetorical.

---

## Rule 5 — `[VERIFY]` Flag for Low Confidence

If a statement is uncertain (memory of an interview not located online, a number that doesn't match across sources, a date the researcher couldn't pin), prepend it with `[VERIFY]` and a 1-line note:

```
[VERIFY] Niwes started buying CPALL through wife's account in April 2008
— number not located in primary source as of 2026-04-20.
```

**Hard rule:** files `01-biography.md` and `04-criteria.md` must contain **zero `[VERIFY]` flags**. Those are foundational facts; if you can't verify, omit rather than flag.

---

## Quick Self-Check Before Each Commit

- [ ] Every quote has URL + date + outlet
- [ ] No quote was "filled in" from memory or inference
- [ ] Every paraphrase is labeled
- [ ] `[VERIFY]` only appears in files where it's allowed (not 01 or 04)
- [ ] Numbers (shares, prices, percentages) cross-checked against ≥1 source

---

## Why This Matters

Karl's actual portfolio decisions will reference these documents. The MaxMahon agent will be trained against this corpus. **One fake quote = years of compounding misinformation downstream.** Be conservative: fewer real quotes is always better than more fake ones.
