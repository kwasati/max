# Max Mahon Changelog

## 2026-04-12 — v2 Server + Dashboard + Buffett/เซียนฮง

- อัพเกรดการวิเคราะห์จาก snapshot ปีเดียว → ดึง 5 ปี financials + 20+ ปี dividends
- Scoring ใหม่ 100 คะแนน 4 ด้าน (Profitability/Growth/Dividend/Strength) + Hard Filters แบบ Buffett
- Signal tags ใหม่ (COMPOUNDER, CASH_COW, DATA_WARNING สำหรับข้อมูลผิดปกติ)
- สร้าง FastAPI server — ดูข้อมูลหุ้นผ่าน web ได้จากทุกที่
- Dashboard แสดง Buffett Checklist + เซียนฮง Checklist + YoY table + กราฟปันผล + DCA verdict
- ทุก metric กดขยายดูคำอธิบายได้ (อธิบายแบบคนธรรมดาฟังรู้เรื่อง)
- Pipeline control จาก browser — กดปุ่ม Fetch/Screen/Full Pipeline ได้เลย
- Request analyze — สั่งวิเคราะห์หุ้นตัวไหนก็ได้ที่ไม่อยู่ใน watchlist
- Scheduler ใน server (แทน Task Scheduler) — อาทิตย์ 09:00 สลับ weekly/discovery
- Cloudflare Tunnel → max.intensivetrader.com เข้าจากภายนอกได้

## 2026-04-11 — วันเกิด Max Mahon

- สร้างระบบทั้งหมดตั้งแต่ 0 — ดึงข้อมูลหุ้นไทย วิเคราะห์ด้วย Claude ทุกสัปดาห์
- Watchlist 12 ตัว — PTT, ADVANC, CPALL, SCB, GULF, BDMS, MINT, AOT, HMPRO, SAWAD, LH, TISCO
- ระบบคัดหุ้น scan ตลาด ~100 ตัว ให้คะแนนตามปันผล ราคา การเติบโต คุณภาพ
- Signal tags ฉลาด — จับ yield trap, หาของถูก (contrarian), จับตัวฟื้นตัว (turnaround), เจอ dividend king
- แก้ bug ข้อมูลหุ้นที่มาไม่ consistent + กรองหุ้นธนาคารผิด + ข้อมูลเพี้ยน
- เพิ่มกองทุนอสังหา (REITs) ใน universe — จุดบอดเดิมที่ขาดหายไป
- ตั้ง schedule รันอัตโนมัติทุกอาทิตย์เช้า
- ทดสอบจริง report แรกออกมาครบถ้วน วิเคราะห์หุ้น 12 ตัวได้เป๊ะ
