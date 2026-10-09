# Bilimlar bazasi: RENT A CAR GTA

Sayt: https://qween-fawn.vercel.app

Avtopark hisobini yuritish uchun sayt: qaysi mashina kimda, haydovchi ijara uchun qancha qarzdor, qancha pul olindi, mashina boʻyicha qanday xarajatlar boʻldi, qachon TXK va hujjatlarni yangilash kerak.

> **Rasmlarni qanday oʻqish kerak.** Skrinshotlarda muhim tugma va maydonlar raqamli qizil ramka bilan belgilangan. Rasm ostida har bir raqam nimani bildirishi yozilgan. Rasmni kattaroq koʻrish uchun ustiga bosing. Skrinshotlardagi ismlar, mashinalar va summalar — namuna uchun.

## Mundarija

1. [Sayt qanday tuzilgan](#1-sayt-qanday-tuzilgan)
2. [Rollar va kim nima qila oladi](#2-rollar-va-kim-nima-qila-oladi)
3. [Pul qanday hisoblanadi](#3-pul-qanday-hisoblanadi)
4. [Umumiy elementlar](#4-umumiy-elementlar)
5. [Kirish va parollar](#5-kirish-va-parollar)
6. [Bosh sahifa](#6-bosh-sahifa)
7. [Bildirishnomalar](#7-bildirishnomalar)
8. [Avtomobillar](#8-avtomobillar)
9. [Mashina kartochkasi](#9-mashina-kartochkasi)
10. [Haydovchilar](#10-haydovchilar)
11. [Haydovchi kartochkasi](#11-haydovchi-kartochkasi)
12. [Haydovchilar hisoboti](#12-haydovchilar-hisoboti)
13. [Ijaraga beruvchilar](#13-ijaraga-beruvchilar)
14. [Dispetcherlar](#14-dispetcherlar)
15. [Moliya](#15-moliya)
16. [Hisobotlar](#16-hisobotlar)
17. [Audit jurnali](#17-audit-jurnali)
18. [Sozlamalar](#18-sozlamalar)
19. [«Mening ijaram» haydovchi kabineti](#19-mening-ijaram-haydovchi-kabineti)
20. [Koʻp uchraydigan vazifalar: bosqichma-bosqich](#20-koʻp-uchraydigan-vazifalar-bosqichma-bosqich)
21. [Maʼlumotnoma: toifalar, toʻlov usullari, holatlar](#21-maʼlumotnoma-toifalar-toʻlov-usullari-holatlar)

---

## 1. Sayt qanday tuzilgan

- **Chap tomonda menyu** (telefonda u chap yuqori burchakdagi uch chiziqli tugma bilan ochiladi). Menyu bandlari rolga bogʻliq.
- **Menyu pastida:**
  - **RU / UZ** til almashtirgichi;
  - **«Tungi rejim» / «Kunduzgi rejim»** tugmasi;
  - **«Chiqish»** tugmasi.
- **Menyu bandlari ustida** — ismingiz va rolingiz. Bosilsa **«Mening profilim»** ochiladi. Telefonda profilga oʻng yuqori burchakdagi bosh harfli sariq doira ham olib boradi.
- **Oynalar** (qoʻshish va tahrirlash shakllari) «×» belgisi, Esc tugmasi yoki oynadan tashqariga bosish bilan yopiladi.
- **Asosiy obyekt — mashina.** Mashinaga oid barcha pul maʼlumotlari uning kartochkasida yoziladi:
  - daromad va xarajatlar;
  - ijara narxi;
  - haydovchiga berish;
  - dam olish kunlari;
  - TXK.
- **Haydovchi** — alohida kartochka: maʼlumotlar, depozit, kirish paroli va kunlar boʻyicha qarzi.

![Sayt menyusi](/kb/uz/02-menu.jpg)

1. **Ismingiz va rolingiz.** Bosing — «Mening profilim» ochiladi (parolni almashtirish).
2. **Sayt boʻlimlari.** Chapdagi sariq chiziq hozir qayerda ekaningizni koʻrsatadi.
3. **«Yordam»** — shu bilimlar bazasi.
4. **Til** — rus yoki oʻzbek.
5. **Tungi rejim** — qorongʻi koʻrinish.
6. **«Chiqish»** — akkauntdan chiqish.

**Telefonda** menyu yashirilgan:

![Telefon: yuqori panel](/kb/uz/32a-mobile-top.jpg "phone") ![Telefon: ochiq menyu](/kb/uz/32-mobile-menu.jpg "phone")

1. **Uch chiziq** menyuni ochadi (oʻng rasmda u ochiq). Yopish — «×» belgisi yoki qorongʻilashgan joyga bosish bilan.
2. **Bosh harfli doira** «Mening profilim»ni ochadi.

Bu bilimlar bazasi saytda menyuning **«Yordam»** boʻlimida ochiladi (administrator, dispetcher va ijaraga beruvchida). Mundarija bandlari bosiladi — kerakli boʻlimga olib boradi, oxiridagi **«Yuqoriga»** tugmasi boshiga qaytaradi.

Agar rolingizga ruxsat berilmagan boʻlim ochilsa, sayt bosh sahifaga yoʻnaltiradi. Mavjud boʻlmagan manzillar ham bosh sahifaga olib boradi.

---

## 2. Rollar va kim nima qila oladi

| Rol | Menyu | Qisqacha |
|---|---|---|
| **Administrator** | Bosh sahifa, Bildirishnomalar, Avtomobillar, Haydovchilar, Ijaraga beruvchilar, Dispetcherlar, Moliya, Haydovchilar hisoboti, Hisobotlar, Audit jurnali, Sozlamalar, Yordam | Hamma narsani qila oladi. Uning pul yozuvlari darhol tasdiqlanadi. |
| **Dispetcher** | Bosh sahifa, Avtomobillar, Haydovchilar, Haydovchilar hisoboti, Yordam | Kundalik ish: pul, mashina berish, haydovchilar. Uning yozuvlari administrator tasdigʻini kutadi. |
| **Ijaraga beruvchi** | Bosh sahifa, Mening avtomobillarim, Moliya, Yordam | Faqat oʻz mashinalari va ularning daromadini koʻradi. |
| **Haydovchi** | Mening ijaram | Faqat oʻz kabineti: mashina, qarz, kunlar boʻyicha toʻlovlar. |

### Administrator
- **Mashinalar:**
  - qoʻshadi, tahrirlaydi (egasi va narxini ham);
  - arxivga oladi va qaytaradi;
  - butunlay oʻchiradi.
- **Pul:**
  - daromad va xarajatlarni yozadi — ular darhol tasdiqlanadi;
  - dispetcherlar yozuvlarini tasdiqlaydi;
  - istalgan yozuvni tahrirlashi yoki oʻchirishi mumkin.
- **Haydovchilar:**
  - qoʻshadi, tahrirlaydi, parol oʻrnatadi;
  - depozitni oʻzgartiradi (buni faqat administrator qila oladi);
  - arxivga oladi, butunlay oʻchiradi.
- **Faqat administratorda:** ijaraga beruvchilar, dispetcherlar, moliya, hisobotlar, bildirishnomalar, audit jurnali, sozlamalar.

### Dispetcher
- **Koʻradi:** barcha mashinalar va barcha haydovchilarni.
- **Pul:**
  - daromad va xarajatlarni yozadi, lekin ular **«Tasdiqlashni kutmoqda»** holatini oladi va faqat administrator tasdiqlagandan keyin yakunlarga kiradi;
  - faqat oʻzining hali tasdiqlanmagan yozuvini tahrirlashi yoki oʻchirishi mumkin.
- **Mashinalar:**
  - mashinani beradi va qabul qiladi;
  - dam olish kunlari va TXKni belgilaydi;
  - mashina maʼlumotlarini oʻzgartiradi (egasi va narxidan tashqari).
- **Haydovchilar:**
  - qoʻshadi, tahrirlaydi, parol oʻrnatadi;
  - arxivga oladi va qaytaradi.
- **Qila olmaydi:**
  - mashina qoʻshish, arxivlash va oʻchirish;
  - haydovchilarni oʻchirish;
  - narx va depozitni oʻzgartirish;
  - yozuvlarni tasdiqlash.
- Mashina kartochkasida barcha daromadlarni, lekin **faqat oʻz** xarajatlarini koʻradi. Foyda va parkning umumiy xarajatlari unga koʻrsatilmaydi.

### Ijaraga beruvchi
- Faqat oʻziga biriktirilgan mashinalarni koʻradi: daromad, xarajatlar, foyda (faqat tasdiqlangan summalar), haydovchilar tarixi, xizmat koʻrsatish.
- Hech narsani oʻzgartira olmaydi.

### Haydovchi
- Faqat oʻzining «Mening ijaram» kabinetini koʻradi. Qolgan barcha boʻlimlar unga yopiq.

---

## 3. Pul qanday hisoblanadi

- **Ijara narxi** — bir kunlik summa. **Mashina haydovchida boʻlgan har bir kun** uchun hisoblanadi, belgilangan **dam olish kunlari** bundan mustasno.
- **Narx oʻzgarishi** tanlangan sanadan boshlab amal qiladi. Oʻtgan kunlar eski narx boʻyicha hisoblanadi, eski hisobotlar oʻzgarmaydi.
- **Toʻlov eng eski kunlarni birinchi yopadi.** Misol: haydovchi 3–5 sanalar uchun qarzdor va bir kunlik pul olib keldi. Avval 3-sana yopiladi.
- **Tasdiqlash.**
  - Dispetcher yozuvi avval **«Tasdiqlashni kutmoqda»** holatida boʻladi. Yakun va foydaga faqat administrator tasdiqlagandan keyin kiradi.
  - Kunlar boʻyicha jadvallarda bunday summalar «kutmoqda» belgisi bilan koʻrinadi.
- **Naqd va «Karta / oʻtkazma».** Kunlar boʻyicha jadvallarda «Naqd»ga faqat «Naqd» usuli kiradi. Karta, oʻtkazma, Click, Payme, Uzum «Karta / oʻtkazma»ga hisoblanadi.
- **Depozit (garov)** ijaraga hisoblanmaydi va kunlar boʻyicha jadvallarga kirmaydi.
- **Davr uchun qarz** — tanlangan sanalar uchun hisoblangan summa minus toʻlangan summa. Agar koʻproq toʻlangan boʻlsa, **«Oldindan toʻlangan»** koʻrsatiladi.

---

## 4. Umumiy elementlar

### Davrni tanlash
Hisobotlarda va kunlar boʻyicha jadvallarda uchraydi.
- **Tezkor tugmalar:** «Shu oy», «Oʻtgan oy», «7 kun», «30 kun», «Yil boshidan».
- **Oʻz davringiz:** «Dan» va «Gacha» maydonlari, keyin **«Koʻrsatish»** tugmasi.

### Oyni tanlash
Moliya bloklarida uchraydi.
- **Oy nomi yozilgan tugma** taqvimni ochadi.
- **Strelkalar** oylarni almashtiradi.
- **Ketma-ket ikki kun.** Birinchi va oxirgi kunni bosing — oʻz davringiz hosil boʻladi.
- **«Butun oy»** oyni toʻliq tanlaydi.

### «Excelga yuklab olish» tugmasi
Joriy jadvalni Excelda ochiladigan faylga saqlaydi.

### «Kunlar boʻyicha» jadvallarida kun holati

| Holat | Maʼnosi |
|---|---|
| **Toʻlangan** (yashil) | Kun uchun toʻliq toʻlangan |
| **Tasdiqlashni kutmoqda** (sariq) | Pulni dispetcher yozgan, lekin hali tasdiqlanmagan |
| **Toʻliq toʻlamadi** (qizil matn) | Narxdan kam toʻlangan |
| **Bermadi** (qizil) | Kun uchun hech narsa toʻlanmagan |
| **Dam olish kuni** (kulrang) | Ijara hisoblanmaydi |
| **—** | Hech narsa hisoblanmagan va toʻlanmagan |

Qarzli qatorlar qizil rangda ajratilgan.

### Katta ijara taqvimi
Haydovchi kartochkasida, «Haydovchilar hisoboti»da va haydovchi kabinetida bor.

| Rang | Maʼnosi |
|---|---|
| Yashil «Yopilgan» | Kun toʻlangan |
| Toʻq sariq «Toʻliq toʻlamadi −summa» | Qisman toʻlangan, qancha yetishmasligi koʻrsatilgan |
| Qizil «Toʻlanmagan −summa» | Toʻlanmagan |
| Och yashil «Oldindan toʻlangan» | Pul oldindan kiritilgan |
| Kulrang «Dam olish kuni» | Hisoblanmaydi |

- **Bugungi kun** ramka bilan belgilangan.
- **Strelkalar** oylarni almashtiradi.
- **Taqvim ustida** yirik qilib yozilgan:
  - **«Ijara yopilgan sana …»** — qaysi kungacha hammasi toʻlangan;
  - **«Qarz sanasi …»** — qaysi kundan qarz;
  - **«Yopish kerak»** — qancha pul yetishmaydi;
  - **«Kunlik ijara»** — joriy narx.

![Katta ijara taqvimi](/kb/uz/18-driver-calendar.jpg)

1. **«Ijara yopilgan sana»** — shu sana ham kiritilgan holda hammasi toʻlangan.
2. **«Qarz sanasi»** — birinchi toʻlanmagan kun.
3. **«Yopish kerak»** — bugungi qarzni yopish uchun qancha pul kerak.

Pastda — taqvimning oʻzi: yashil kunlar yopilgan, toʻq sariq qisman toʻlangan, qizillar toʻlanmagan. Eʼtibor bering: toʻlov **eng eski kunlarni birinchi** yopadi, shuning uchun kam toʻlov doim oxirgi qisman yopilgan kunda koʻrinadi.

---

## 5. Kirish va parollar

### Kirish sahifasi
- **Maydonlar:** «Login» va «Parol», **«Kirish»** tugmasi.
- **Bloklash.** 5 marta notoʻgʻri urinishdan keyin akkaunt 30 daqiqaga bloklanadi.
- **Parolni unutsangiz** — administratorga murojaat qiling, u vaqtinchalik parol beradi.
- **Yuqorida** tilni va mavzuni almashtirish mumkin.

![Kirish sahifasi](/kb/uz/01-login.jpg)

1. **Til** — RU yoki UZ.
2. **Tungi rejim.**
3. **Login** — administrator beradi (haydovchiga — administrator yoki dispetcher).
4. **Parol.**
5. **«Kirish».**

### Parolni almashtirish
Sayt parolni almashtirishni oʻzi soʻraydi:
- yangi haydovchi va yangi dispetcherdan birinchi kirishda;
- administrator yoki dispetcher haydovchiga parol oʻrnatganidan keyin;
- dispetcher paroli tiklanganidan keyin.

Yangi parolga talablar: **kamida 10 ta belgi, harflar va raqamlar**. Maydonlar: «Yangi parol» va «Yangi parolni takrorlang», **«Saqlash»** tugmasi.

### Mening profilim
- **Koʻrsatadi:** F.I.Sh., login, telefon, rol, roʻyxatdan oʻtgan sana.
- **«Parolni almashtirish» bloki:**
  - «Joriy parol», «Yangi parol», «Parolni tasdiqlash» maydonlari;
  - **«Parolni almashtirish»** tugmasi.

---

## 6. Bosh sahifa

### Administrator va dispetcher
- **Barcha mashinalar plitkalari.** Eʼtibor talab qiladigan mashinalar birinchi turadi va ramka bilan ajratilgan.
- **Plitkada:**
  - surat, raqam;
  - haydovchi yoki «Haydovchisiz», holat;
  - kunlik narx;
  - **qarz** (qizil) yoki «yoʻq».
- **Plitkadagi belgilar:**
  - «Tasdiqlashni kutmoqda · summa»;
  - «Xizmat koʻrsatish vaqti keldi» / «Tez orada TXK»;
  - «Sugʻurta» / «Texnik koʻrik» — tez orada tugaydi yoki muddati oʻtgan.
- **Amallar:**
  - plitkaga bosish mashina kartochkasini ochadi;
  - **qalam** mashinani tahrirlash shaklini ochadi;
  - **«Barcha avtomobillar»** havolasi «Avtomobillar» boʻlimiga olib boradi.

![Bosh sahifa: mashina plitkalari](/kb/uz/03-home-tiles.jpg)

1. **Nechta mashina ijarada** (jamidan).
2. **Mashina plitkasi.** Bosing — mashina kartochkasi ochiladi. Sariq ramka — mashina eʼtibor talab qiladi.
3. **Qarz** — shu mashina boʻyicha haydovchi qarzi (qizil). «yoʻq» — qarz yoʻq.
4. **«Tasdiqlashni kutmoqda»** — dispetcher pul yozgan, administrator hali tasdiqlamagan.
5. **Hujjat yoki TXK belgisi** — masalan, «Texnik koʻrik» muddati oʻtgan.
6. **Qalam** — mashina maʼlumotlarini tez tahrirlash.
7. **«Barcha avtomobillar»** — «Avtomobillar» boʻlimiga oʻtish.

- **Faqat administratorda** pastda **«Park moliyasi»** bloki bor:
  - tushum, xarajatlar, sof daromad va oʻtgan oyga nisbatan oʻzgarish;
  - kunlar boʻyicha grafik;
  - **«Eʼtibor talab qiladigan narsalar»** bloki: nechta mashinada qarz bor va nechta yozuv tasdiqlashni kutmoqda.

![Bosh sahifa: park moliyasi](/kb/uz/04-home-finance.jpg)

1. **«Park moliyasi»** — faqat tasdiqlangan pul.
2. **Oyni tanlash** — boshqa oy yoki oʻz davringizni tanlash uchun bosing.

- **Faqat dispetcherda** pastda uning yozuvlari boʻyicha **«Xulosa»** bor:
  - «Bugun olingan»;
  - «Bir oyda» (administrator tasdiqlagan);
  - «Haydovchilar qarzi»;
  - «Tasdiqlashni kutmoqda»;
  - 14 kunlik grafik.

![Dispetcherning bosh sahifasi: xulosa](/kb/uz/28-disp-home.jpg)

1. **«Bugun olingan»** — bugun siz yozgan pul.
2. **«Bir oyda»** — administrator allaqachon tasdiqlagan yozuvlaringiz.
3. **«Haydovchilar qarzi»** — haydovchilar jami qancha qarzdor.
4. **«Tasdiqlashni kutmoqda»** — administrator hali tekshirmagan yozuvlaringiz.
5. **Grafik** — 2 hafta davomida kunlar boʻyicha qancha olingan.

### Ijaraga beruvchi
- **Oʻz mashinalari plitkalari:** holat, daromad, xarajatlar, foyda.
- **Pastda:** oylik moliya bloki — «Kuniga oʻrtacha», «Eng yaxshi kun».

![Ijaraga beruvchining bosh sahifasi](/kb/uz/29-owner-home.jpg)

---

## 7. Bildirishnomalar

Faqat administrator. Bu yerda eʼtibor talab qiladigan barcha muddatlar va ishlar yigʻilgan.

- **Filtrlar:** «Hammasi», «Shoshilinch» (qizil), «Tez orada» (toʻq sariq).
- **Bu yerga nimalar tushadi:**
  - mashinaning sugʻurtasi va texnik koʻrigi tugagan yoki tez orada tugaydi;
  - TXK vaqti keldi (sana yoki probeg boʻyicha);
  - dispetcherlar yozuvlari tasdiqlashni kutmoqda;
  - haydovchining haydovchilik guvohnomasi muddati oʻtgan yoki tez orada tugaydi.
- **Bildirishnomaga bosish** kerakli mashina yoki haydovchini ochadi.
- **«Tez orada» qachon boshlanishi** — «Sozlamalar»da belgilanadi (odatda 7 kun va 1000 km oldin).

![Bildirishnomalar](/kb/uz/05-notifications.jpg)

1. **«Hammasi»** — butun roʻyxat.
2. **«Shoshilinch»** — muddati allaqachon oʻtgan (qizil).
3. **«Tez orada»** — muddat yaqinlashmoqda (toʻq sariq).

---

## 8. Avtomobillar

Ijaraga beruvchida boʻlim «Mening avtomobillarim» deb ataladi.

| Element | Kim koʻradi | Nima qiladi |
|---|---|---|
| **«+ Avtomobil qoʻshish»** | Administrator | Yangi mashina shaklini ochadi |
| **Qidiruv** | Hamma | Raqam, marka, haydovchi, ega boʻyicha qidiradi |
| **«Hammasi / Ijarada / Boʻshlar»** | Hamma | Holat boʻyicha filtr (soni bilan) |
| **«Arxiv»** | Administrator | Arxivdagi mashinalarni koʻrsatadi |
| **«Kartochkalar / Jadval»** | Hamma | Roʻyxat koʻrinishi (eslab qolinadi) |
| **Kartochkadagi qalam** | Administrator, dispetcher | Mashina maʼlumotlarini tahrirlash |
| Mashinaga bosish | Hamma | Mashina kartochkasini ochadi |

![Avtomobillar](/kb/uz/06-cars.jpg)

1. **«+ Avtomobil qoʻshish»** (faqat administrator).
2. **Qidiruv** — raqam, marka, haydovchi boʻyicha.
3. **Filtr:** hammasi, ijarada, boʻshlar (yonida — soni).
4. **«Arxiv»** — ishdan olingan mashinalar.
5. **Koʻrinish:** kartochkalar yoki jadval.

### Mashinalar arxivi (administrator)
- **Roʻyxatda:** raqam, mashina, arxivga olingan sana.
- **«Qaytarish»** — mashina yana faollar orasida «Boʻsh» holati bilan paydo boʻladi.
- **«Butunlay oʻchirish»** — mashina **barcha daromad, xarajat va tarixi bilan birga** oʻchiriladi. Bekor qilib boʻlmaydi.

### Mashina shakli
- **Surat:**
  - «Surat yuklash» / «Suratni almashtirish» / «Olib tashlash»;
  - JPG, PNG, WEBP mos keladi;
  - surat boʻlmasa, mashina oʻz rangida chizilgan rasm bilan koʻrsatiladi.
- **«Mashina» bloki:**
  - **Marka\***, **Model\***, **Davlat raqami\***;
  - Yil, Rang, Yoqilgʻi.
- **«Hujjatlar va probeg» bloki:** VIN, Hozirgi probeg, Sugʻurta muddati, Texnik koʻrik muddati.
- **«Egaligi» bloki** (faqat administrator):
  - Ijaraga beruvchi;
  - «Kunlik ijara narxi» — faqat yaratishda, keyin kartochkada oʻzgartiriladi.
- **Tugmalar:** «Avtomobil qoʻshish» / «Saqlash» va «Bekor qilish».

\* — majburiy maydon. Raqam takrorlanmasligi kerak.

![Yangi mashina shakli](/kb/uz/07-car-form.jpg)

1. **Mashina surati** — yuklamasa ham boʻladi, unda mashina rangidagi rasm koʻrsatiladi.
2. **Yulduzchali maydonlar** majburiy: marka, model, davlat raqami.
3. **Probeg va hujjat muddatlari** — shular boʻyicha sayt sugʻurta, texnik koʻrik va TXK haqida eslatadi.

---

## 9. Mashina kartochkasi

### Sahifa yuqorisi
- **Koʻrsatadi:** surat, raqam, marka, holat.
- **Belgilar:** joriy haydovchi, «Xizmat koʻrsatish vaqti keldi», «Sugʻurta/Texnik koʻrik tez orada/muddati oʻtgan».
- **Tugmalar:**
  - **«Maʼlumotlarni tahrirlash»** (administrator, dispetcher) — mashina shakli;
  - **«Arxivga»** (administrator) — mashinani ishdan olish, uni qaytarish mumkin;
  - **«Oʻchirish»** (administrator) — butun tarixi bilan butunlay oʻchirish.
- Mashina haydovchida boʻlsa, arxivlash va oʻchirish mumkin emas: avval «Haydovchi» yorligʻida **mashinani qabul qilish** kerak.

### Yuqoridagi plitkalar

| Rol | Plitkalar |
|---|---|
| Dispetcher | Hisoblangan (necha kunlik ijara uchun), Olingan, Qarz yoki Ortiqcha toʻlov |
| Administrator | Shular, yana Xarajatlar va Foyda |
| Ijaraga beruvchi | Daromad, Xarajatlar, Foyda |

Tasdiqlanmagan yozuvlar boʻlsa, administrator **«Hammasini tasdiqlash»** tugmali **«Tasdiqlashni kutmoqda: N»** sariq panelini koʻradi.

![Mashina kartochkasi: yuqori qismi](/kb/uz/08-car-top.jpg)

1. **«Maʼlumotlarni tahrirlash»** — marka, raqam, hujjatlar, probeg.
2. **«Arxivga»** — mashinani ishdan olish (qaytarish mumkin).
3. **«Oʻchirish»** — pul maʼlumotlari bilan birga butunlay oʻchirish.
4. **Pul plitkalari:** hisoblangan, olingan, qarz, xarajatlar, foyda.
5. **Sariq panel** — dispetcherning tekshiruvni kutayotgan yozuvlari bor.
6. **«Hammasini tasdiqlash»** — ularni birdaniga tasdiqlash.
7. **Kartochka yorliqlari** (pastda tavsiflangan). Yorliqdagi raqam — u yerda nechta ish borligi.

### Yorliqlar

| Yorliq | Kim koʻradi | Nima uchun |
|---|---|---|
| **Hisobot** | Hamma | Mashina boʻyicha pul: yozuvlar va kunlar boʻyicha jadval |
| **Haydovchi** | Hamma | Mashinani berish / qabul qilish, haydovchilar tarixi |
| **Dam olish kunlari** | Administrator, dispetcher | Ijara hisoblanmaydigan kunlar |
| **Xizmat koʻrsatish** | Hamma | TXK: reja va bajarilganlar |
| **Mashina haqida** | Hamma | Maʼlumotlar va hujjatlar |

### «Hisobot» yorligʻi → «Amallar»

**«Hisobotga qoʻshish» shakli** (administrator, dispetcher):

| Maydon / tugma | Nima qiladi |
|---|---|
| **«+ Daromad» / «− Xarajat»** | Yozuv turi |
| **Summa** | Majburiy |
| **Nima uchun / Nimaga** | Toifa (ijara, depozit, benzin, taʼmir va h.k.) |
| **Usul** | Naqd, Karta, Oʻtkazma, Click, Payme, Uzum |
| **Sana** | Odatda bugun |
| **Izoh** | Ixtiyoriy |
| **«Yozib qoʻyish»** | Yozuvni saqlaydi |

Administratorning yozuvi darhol tasdiqlanadi. Dispetcherning yozuvi administratorga tasdiqlash uchun ketadi.

**«Amallar tarixi»:**
- **Filtrlar:** «Hammasi», «Daromadlar», «Xarajatlar», «Kutmoqda (N)».
- **Yozuv yonidagi tugmalar:**
  - **«Tasdiqlash»** (administrator) — kutayotgan yozuvlar uchun;
  - **«Tahrirlash»** — administrator istalganini, dispetcher faqat oʻzining tasdiqlanmaganini;
  - **«Oʻchirish»** — xuddi shu qoida.

**«Ijara narxi» paneli:**
- Joriy narxni va jami qancha hisoblanganini koʻrsatadi.
- **Administrator:**
  - «Yangi narx» va «Amal qilish sanasi» maydonlari, **«Narxni oʻzgartirish»** tugmasi;
  - ochiladigan **«Narxlar tarixi»**.

![Hisobotga qoʻshish va amallar tarixi](/kb/uz/09-car-operations.jpg)

1. **«+ Daromad»** — haydovchi pul olib keldi, depozit yoki boshqa daromad.
2. **«− Xarajat»** — benzin, taʼmir, jarima, yuvish va h.k.
3. **«Yozib qoʻyish»** — saqlash. Summa, «Nima uchun», usul va sanani toʻldiring.
4. **«Amallar tarixi»** — mashina boʻyicha barcha yozuvlar. Oʻngdagi filtrlar: hammasi, daromadlar, xarajatlar, kutmoqda.
5. **«Tasdiqlash»** — dispetcher yozuvi yonida (sariq fon, «Tasdiqlashni kutmoqda»).

![Ijara narxi](/kb/uz/10-car-rate.jpg)

1. **Joriy kunlik narx** va jami qancha hisoblangani.
2. **«Narxni oʻzgartirish»** — yangi narxni va u amal qiladigan sanani yozing.
3. **«Narxlar tarixi»** — barcha oldingi oʻzgarishlar.

### «Hisobot» yorligʻi → «Kunlar boʻyicha»
Tanlangan davrning har bir kuni boʻyicha jadval.
- **Ustunlar:**
  - Sana, Haydovchi, Hisoblangan;
  - Naqd, Karta / oʻtkazma;
  - Kunlik qarz, Holat.
- **Yuqorida yakunlar:** Hisoblangan, Naqd, Karta / oʻtkazma, Davr uchun qarz (yoki «Oldindan toʻlangan»).
- **«Excelga yuklab olish» tugmasi.**

![Kunlar boʻyicha hisobot](/kb/uz/11-car-days.jpg)

1. **«Kunlar boʻyicha»** — koʻrinish almashtirgichi (yonida «Amallar»).
2. **Davr:** tezkor tugmalar yoki «Dan» va «Gacha» sanalari.
3. **«Davr uchun qarz»** — tanlangan kunlar uchun qancha toʻlanmagan.
4. **«Excelga yuklab olish».**
5. **Kun holati:** «Toʻlangan», «Bermadi», «Toʻliq toʻlamadi». Qarzli qatorlar qizil rangda.

### «Haydovchi» yorligʻi

**Mashina boʻsh boʻlsa** (administrator, dispetcher):
- **Boʻsh haydovchi**, **berish sanasi** va **berishdagi probeg**ni tanlang.
- **«Mashinani berish»** ni bosing. Shu kundan ijara hisoblana boshlaydi.

**Mashina haydovchida boʻlsa:**
- **«Mashinani qabul qilish»** oynani ochadi, unda **topshirish sanasi** va **topshirishdagi probeg**ni koʻrsatish kerak.
- Topshirishdagi probeg berishdagidan kam boʻlishi mumkin emas.
- Shundan keyin mashina ham, haydovchi ham boʻsh boʻladi.

**«Mashinada kim yurgan»** (barcha rollar):
- Taqvim: haydovchi bilan boʻlgan kunlar yashil rangda. Kim yurganini koʻrish uchun kunga bosing.
- **Barcha berishlar roʻyxati:** haydovchi, sanalar, necha kun, probeg, kim bergan.

**Mashina boʻsh — beramiz:**

![Mashinani berish](/kb/uz/13-car-assign.jpg)

1. **Haydovchi** — boʻshlar orasidan tanlang.
2. **Berish sanasi** (yonida probeg). Shu sanadan ijara hisoblana boshlaydi.
3. **«Mashinani berish».**

**Mashina haydovchida — qabul qilamiz:**

![Mashinani qabul qilish](/kb/uz/12-car-driver.jpg)

1. **«Mashinani qabul qilish»** — topshirish sanasi va probegni koʻrsating.
2. **«Mashinada kim yurgan»** — haydovchini koʻrish uchun taqvimdagi kunga bosing.

### «Dam olish kunlari» yorligʻi
- **Belgilash:** mashina ishlamagan kunlarga bosing. Bu kunlarda ijara hisoblanmaydi.
- **Olib tashlash:** qayta bosish dam olish kunini olib tashlaydi.
- **Saqlash yoki bekor qilish:** **«Saqlash»** / **«Bekor qilish»** tugmalari oʻzgarishlardan keyin paydo boʻladi.

![Dam olish kunlari](/kb/uz/14-car-daysoff.jpg)

1. **Strelkalar** — oylarni almashtirish.
2. **Sariq kunlar** — dam olish kunlari: bu kunlarda ijara hisoblanmaydi.

### «Xizmat koʻrsatish» yorligʻi
- **Rejalashtirilgan TXK:**
  - «Tez orada», «Xizmat koʻrsatish vaqti keldi», «Rejalashtirilgan» belgilari;
  - **«Bajarildi»** oynani ochadi: narx, probeg, sana. Narx mashina **xarajatlariga avtomatik yoziladi** («TXK» toifasi);
  - **«Oʻchirish»** rejalashtirilgan TXKni olib tashlaydi.
- **Qoʻshish shakli:**
  - «Nima» (TXK turi);
  - «Shu sanagacha bajarish» yoki «shu probegda»;
  - izoh.
- **«Allaqachon bajarilgan» belgisi:** bajarilgan TXKni narxi bilan darhol yozish mumkin.
- **«Avval bajarilgan»** — bajarilgan TXK tarixi.

![Xizmat koʻrsatish](/kb/uz/15-car-service.jpg)

1. **«Bajarildi»** — rejalashtirilgan TXKni bajarilgan deb belgilash (narxi xarajatlarga tushadi).
2. **«Rejalashtirish»** — TXK qoʻshish: nima, qaysi sanagacha yoki qaysi probegda.
3. **«Allaqachon bajarilgan»** — TXK allaqachon qilingan boʻlsa va narxini darhol yozish kerak boʻlsa, belgi qoʻying.

### «Mashina haqida» yorligʻi
Ijaraga beruvchi, yil va rang, VIN, yoqilgʻi, probeg, sugʻurta va texnik koʻrik muddatlari.

---

## 10. Haydovchilar

Administrator va dispetcher.

| Element | Nima qiladi |
|---|---|
| **«Faollar / Arxiv / Kutish roʻyxati»** | Roʻyxat rejimi |
| **«+ Haydovchi qoʻshish»** | Yangi haydovchi shakli |
| **Qidiruv** | Ism, telefon, mashina raqami, login, pasport boʻyicha |
| Kartochkaga bosish | Haydovchi kartochkasini ochadi |
| **«Arxivga»** | Haydovchini ishdan olish (u kabinetga kira olmaydi) |
| **«Qaytarish»** (arxivda) | Haydovchini qaytarish |
| **«Butunlay oʻchirish»** | Faqat administrator. Bekor qilib boʻlmaydi |

- **Kartochkada:**
  - ism, telefon, depozit, guvohnoma raqami;
  - «Mashinada …» yoki «Boʻsh» belgisi;
  - «Guvohnoma muddati oʻtgan» / «Guvohnoma muddati …» belgilari (guvohnoma 30 kun ichida tugasa).
- **Haydovchi mashinada boʻlsa**, arxivlash va oʻchirish mumkin emas: avval undan mashinani qabul qilish kerak.

![Haydovchilar](/kb/uz/16-drivers.jpg)

1. **Roʻyxat rejimi:** faol haydovchilar.
2. **«+ Haydovchi qoʻshish».**
3. **Qidiruv** — ism, telefon, mashina raqami boʻyicha.
4. **«Arxivga»** — haydovchini ishdan olish.
5. **«Butunlay oʻchirish»** (faqat administrator).
6. **«Kutish roʻyxati»** — boʻsh mashina kutayotganlar.

Kartochkada koʻrinadi: haydovchi qaysi mashinada, depozit, guvohnoma raqami va muddati («Guvohnoma muddati oʻtgan» — qizil).

### Haydovchi shakli
- **F.I.Sh.\*** va **Login\***.
- **Parol\*** — kamida 6 ta belgi. Tahrirlashda maydonni boʻsh qoldirish mumkin.
- Telefon (+998…), pasport, guvohnoma va uning muddati.
- Depozit — faqat yaratishda.

Haydovchi shu login va parol bilan oʻz kabinetiga kiradi. Birinchi kirishda u oʻz parolini oʻylab topishi kerak boʻladi.

### Kutish roʻyxati
Boʻsh mashina boʻlmaganda mashina soʻragan haydovchilar shu yerga yoziladi.
- **«+ Kutish roʻyxatiga yozish»:** ism\*, telefon\*, qaysi mashinani soʻragan, izoh.
- **Yozuv yonidagi tugmalar:**
  - **«Yopish»** — mashina topildi yoki endi kerak emas;
  - **«Qaytarish»**;
  - **«Tahrirlash»**;
  - **«Oʻchirish»**.
- **«Yopilganlarni koʻrsatish» belgisi** yopilgan yozuvlarni ham koʻrsatadi.

---

## 11. Haydovchi kartochkasi

### Yuqoridagi tugmalar
- **«Maʼlumotlarni tahrirlash»** — haydovchi shakli.
- **«Arxivga»** / **«Arxivdan qaytarish»**.
- **«Oʻchirish»** — faqat administrator.

### Bloklar

| Blok | Nimani koʻrsatadi va qanday tugmalar |
|---|---|
| **Maʼlumotlar** | Telefon, pasport, guvohnoma, uning muddati, qachon qoʻshilgan |
| **Haydovchi kabinetiga kirish** | Login va **«Parol oʻrnatish»** tugmasi. Oynada loginni oʻzgartirish mumkin, sayt vaqtinchalik parolni oʻzi oʻylab topadi (**«Boshqasi»** tugmasi — yangi variant). Saqlagandan keyin haydovchiga berish uchun sayt, login va parol koʻrsatiladi. Birinchi kirishda haydovchi parolni almashtiradi |
| **Mashinalar** | Qaysi mashinalarda va qachon yurgan |
| **Depozit** | Depozit summasi. **«Depozitni oʻzgartirish»** — faqat administrator (yangi summa va sabab). Pastda oʻzgarishlar tarixi |
| **Ijara taqvimi** | Katta taqvim: ijara qaysi sanagacha yopilgan, qaysi kundan qarz, qancha yopish kerak (4-boʻlimga qarang) |
| **Kunlar boʻyicha toʻlovlar va qarz** | **«Berdi»** tugmali kunlar boʻyicha jadval (12-boʻlimga qarang) |

![Haydovchi kartochkasi](/kb/uz/17-driver-card.jpg)

1. **«Maʼlumotlarni tahrirlash»** — F.I.Sh., telefon, pasport, guvohnoma.
2. **«Parol oʻrnatish»** — haydovchiga «Mening ijaram» kabinetiga kirish huquqini berish.
3. **«Depozitni oʻzgartirish»** (faqat administrator).

Shu sahifaning pastida — katta ijara taqvimi (rasmi 4-boʻlimda) va kunlar boʻyicha toʻlovlar jadvali.

---

## 12. Haydovchilar hisoboti

Administrator va dispetcher. Har kungi belgilash uchun asosiy sahifa: haydovchi pul berdimi yoki yoʻqmi.

- **«Haydovchi» roʻyxati:**
  - **«Barcha haydovchilar»** — umumiy jadval;
  - aniq haydovchi — uning taqvimi va kunlari.
- **Davrni tanlash** butun sahifaga taʼsir qiladi.

### Barcha haydovchilar
- **Ustunlar:**
  - Haydovchi, Mashina, Hisoblangan;
  - Naqd, Karta / oʻtkazma;
  - **Davr uchun qarz**, **Qarzli kunlar**.
- **Tartib:** qarzli haydovchilar qizil rangda va birinchi turadi.
- **Haydovchiga bosish** uning kunlarini ochadi.
- **«Excelga yuklab olish» tugmasi.**

![Haydovchilar hisoboti: hammasi](/kb/uz/19-driver-report.jpg)

1. **Haydovchi** — «Barcha haydovchilar» yoki bittasini tanlang.
2. **Davr.**
3. **Haydovchi qatori** — kunlarini ochish uchun bosing. Qizil qatorlar — qarz bor.
4. **«Excelga yuklab olish».**

### Bitta haydovchi
- **Yuqoridagi tugmalar:**
  - **«← Barcha haydovchilar»** — umumiy jadvalga qaytish;
  - **«Haydovchi kartochkasi»** — uning kartochkasini ochish.
- **Katta ijara taqvimi.**
- **«Kunlar boʻyicha toʻlovlar» jadvali.** Kun uchun qarz boʻlsa, har bir kunda **«Berdi»** tugmasi, summa qoʻshmoqchi boʻlsangiz — **«Yana»** tugmasi.

### «Pul berdi» oynasi
- **Koʻrsatadi:** kun uchun qancha kerak, qancha allaqachon olingan va qancha yetishmaydi.
- **Maydonlar:**
  - **«Naqd»** va **«Karta orqali»** — ikkalasini ham toʻldirish mumkin;
  - izoh.
- **Tezkor tugmalar:** «Hammasi naqd» va «Hammasi karta orqali» yetishmayotgan summani qoʻyadi.
- **Summa keragidan kam boʻlsa,** sayt ogohlantiradi: holat **«Toʻliq toʻlamadi»** boʻladi.
- **«Yozib qoʻyish»** toʻlovni shu kun uchun mashina boʻyicha «Ijara» daromadi sifatida saqlaydi.
  - Dispetcherda yozuv administratorga tasdiqlash uchun ketadi.

![Bitta haydovchining kunlar boʻyicha toʻlovlari](/kb/uz/20-driver-report-one.jpg)

1. **«Kunlar boʻyicha toʻlovlar»** — tanlangan davr uchun jadval.
2. **«Berdi»** — qarzli kunda: haydovchi pul olib kelganini yozish.
3. **«Yana»** — toʻlangan kunda: yana summa qoʻshish.

![«Pul berdi» oynasi](/kb/uz/21-paid-modal.jpg)

Yuqorida kun uchun qancha kerakligi, qancha allaqachon olingani va qancha yetishmasligi koʻrinadi.

1. **«Naqd»** — naqd summa.
2. **«Karta orqali»** — karta yoki oʻtkazma orqali summa. Ikkala maydonni ham toʻldirish mumkin.
3. **«Hammasi naqd» / «Hammasi karta orqali»** — yetishmayotgan summani bir bosishda qoʻyish.
4. **«Yozib qoʻyish».**

---

## 13. Ijaraga beruvchilar

Faqat administrator. Mashinalar egalari.

- **«+ Ijaraga beruvchi qoʻshish»** — shakl:
  - **Nomi yoki F.I.Sh.\***, **Telefon\***;
  - aloqa uchun shaxs, email;
  - rekvizitlar (STIR, hisob raqami, bank).
- **Kartochkada:**
  - nechta mashina, telefon, email, rekvizitlar;
  - **«Tahrirlash»** tugmasi;
  - **«Arxivga»** tugmasi — faqat egasining mashinasi boʻlmasa.
- Pastdagi **«Arxiv (N)»** — arxivdagi egalar roʻyxati.

Mashina ijaraga beruvchiga mashina shaklidagi «Ijaraga beruvchi» maydoni orqali biriktiriladi.

![Ijaraga beruvchilar](/kb/uz/22-owners.jpg)

1. **«+ Ijaraga beruvchi qoʻshish».**
2. **«Tahrirlash»** — ega maʼlumotlari. «Arxivga» tugmasi faqat egasining mashinasi boʻlmaganda paydo boʻladi.

---

## 14. Dispetcherlar

Faqat administrator.

- **«Dispetcher qoʻshish»:**
  - F.I.Sh., telefon (+998…), login maydonlari;
  - **«Yaratish»** tugmasi;
  - sayt vaqtinchalik parolni **bir marta** koʻrsatadi — uni dispetcherga bering;
  - birinchi kirishda dispetcher parolni almashtiradi.
- **Holatlar:**
  - «Hali kirmagan» — dispetcher vaqtinchalik parolni hali almashtirmagan;
  - «Faol»;
  - «Bloklangan».
- **«Parolni tiklash»** yangi vaqtinchalik parol beradi.
- **«Arxivlash»:**
  - sababini koʻrsatish kerak;
  - dispetcher endi kira olmaydi.

![Dispetcherlar](/kb/uz/23-dispatchers.jpg)

1. **«Dispetcher qoʻshish».**
2. **Holat** — «Hali kirmagan» vaqtinchalik parol hali almashtirilmaganini bildiradi.
3. **«Parolni tiklash»** — yangi vaqtinchalik parol berish.
4. **«Arxivlash»** — kirishni yopish.

---

## 15. Moliya

Administrator va ijaraga beruvchi. **Faqat tasdiqlangan** summalar hisoblanadi.

### Oylik blok
- tushum, xarajatlar, sof daromad;
- oʻtgan oy bilan solishtirish;
- kunlar boʻyicha grafik.

### «Davr boʻyicha batafsil»
- **Plitkalar:**
  - Daromad, Xarajatlar, Foyda;
  - administratorda yana: Hisoblangan ijara, Hozirgi qarz, Tasdiqlashni kutmoqda.
- **«Kunlar boʻyicha»** — grafik.
- **«Xarajatlar qayerga ketdi»** — toifalar boʻyicha xarajatlar.
- **«Ijaraga beruvchilar boʻyicha»** (administrator) yoki **«Mashinalar boʻyicha»** (ijaraga beruvchi).

![Oylik moliya](/kb/uz/24-finance.jpg)

1. **Oyni tanlash** — pastdagi blok tanlangan oy uchun hisoblanadi va oʻtgan oy bilan solishtiriladi.

![Moliya: davr boʻyicha batafsil](/kb/uz/24b-finance-period.jpg)

Yakuniy plitkalar, kunlar boʻyicha daromad va xarajatlar grafigi, pastda — xarajatlar nimaga ketgani va egalar boʻyicha daromad.

---

## 16. Hisobotlar

Faqat administrator.
- Yuqoridagi **davrni tanlash** barcha yorliqlar uchun umumiy.
- **«Excelga yuklab olish»** joriy jadvalni saqlaydi.

| Yorliq | Nimani koʻrsatadi |
|---|---|
| **Mashinalar boʻyicha** | Har bir mashina boʻyicha: haydovchi, hisoblangan, daromad, xarajatlar, foyda, hozirgi qarz. Qatorga bosish mashinani ochadi |
| **Mashina boʻyicha** | Mashinani tanlang — har bir kun boʻyicha jadval (kartochkadagi «Kunlar boʻyicha» kabi). **«Mashinani ochish»** tugmasi |
| **Haydovchilar boʻyicha** | «Haydovchilar hisoboti» bilan bir xil: haydovchilar qarzlari va «Berdi» tugmali kunlar |
| **Ijaraga beruvchilar boʻyicha** | Har bir ega boʻyicha mashinalar soni, daromad, xarajatlar, foyda |
| **Qarzlar** | Faqat haydovchi qarzdor boʻlgan mashinalar (butun vaqt uchun) |
| **Kunlar boʻyicha** | Har bir kun boʻyicha daromad, xarajat va yakun |

![Hisobotlar](/kb/uz/25-reports.jpg)

1. **Hisobot yorliqlari** — mashinalar, bitta mashina, haydovchilar, egalar boʻyicha, qarzlar, kunlar boʻyicha.
2. **Davr** — barcha yorliqlar uchun umumiy.
3. **«Excelga yuklab olish».**

---

## 17. Audit jurnali

Faqat administrator. Tizimdagi barcha harakatlar tarixi.
- **Ustunlar:** vaqt, kim qilgan, harakat, obyekt.
- **Tafsilotlar:** **«Avval / Keyin»** ochiladi.
- **Sahifalar:** 50 tadan yozuv, «← Orqaga» / «Oldinga →» tugmalari.

![Audit jurnali](/kb/uz/26-audit.jpg)

1. **«Keyin»** (yoki «Avval / Keyin») — aynan nima oʻzgarganini koʻrish uchun bosing.

---

## 18. Sozlamalar

Faqat administrator. **«Saqlash»** va **«Tiklash»** tugmalari (saqlanmagan oʻzgarishlarni bekor qilish).

Hozir **haqiqatan ishlaydigan** ikkita sozlama bor:
- **«Hujjatlar va TXK haqida oldindan eslatish» (kun)** — sugʻurta, texnik koʻrik, sana boʻyicha TXK va haydovchi guvohnomasi necha kun oldin «Tez orada» boʻladi (odatda 7);
- **«TXK haqida oldindan eslatish» (km)** — probeg boʻyicha TXKgacha necha km qolganda «Tez orada» paydo boʻladi (odatda 1000).

Qolgan maydonlar saqlansa ham, hozircha hech narsaga taʼsir qilmaydi:
- kompaniya nomi, valyuta, vaqt mintaqasi;
- minimal toʻlov summasi;
- kirish urinishlari soni va bloklash vaqti — hozir doim 5 urinish va 30 daqiqa.

![Sozlamalar](/kb/uz/27-settings.jpg)

1. **Necha kun oldin** sugʻurta, texnik koʻrik, TXK va guvohnoma haqida ogohlantirish.
2. **Necha km oldin** probeg boʻyicha TXK haqida ogohlantirish.
3. **«Saqlash».** «Tiklash» — saqlanmagan oʻzgarishlarni bekor qilish.

---

## 19. «Mening ijaram» haydovchi kabineti

Haydovchi kirgandan keyin koʻradigan sahifa.

- **Mashina kartochkasi:** surat, raqam, «Kunlik ijara».
- **Katta ijara taqvimi:**
  - ijara qaysi sanagacha yopilgan;
  - qaysi sanadan qarz;
  - qancha yopish kerak.
- **«Kunlar boʻyicha toʻlovlar»** — uning kunlari jadvali. Odatda oxirgi 30 kun, davrni almashtirish mumkin.
- **Toʻlov haqida eslatma:**
  - qarz boʻlsa, kirgan zahoti summa yozilgan oyna chiqadi;
  - keyin sahifa ochiq turgan paytda u **soatiga bir marta** takrorlanadi;
  - **«Tushunarli»** tugmasi oynani yopadi.
- **Brauzer bildirishnomalari:**
  - **«Bildirishnomalarni yoqish»** tugmasi ularga ruxsat beradi;
  - shunda eslatma vkladka yigʻib qoʻyilgan boʻlsa ham keladi.
- **Mashina boʻlmasa,** sayt shuni yozadi: dispetcher mashina berganda ijara paydo boʻladi.

Kabinet haydovchining telefonida shunday koʻrinadi:

![Toʻlov haqida eslatma](/kb/uz/30-driver-home.jpg "phone") ![Mening ijaram](/kb/uz/31-driver-home-2.jpg "phone") ![Kunlar boʻyicha toʻlovlar](/kb/uz/31b-driver-days.jpg "phone")

- **Chapda:** qarz haqida eslatma oynasi. **«Tushunarli»** tugmasi (1) uni yopadi.
- **Oʻrtada:** **«Bildirishnomalarni yoqish»** (1) va «Ijara yopilgan sana» kartochkasi (2) — qaysi sanagacha hammasi toʻlangan va qancha qolgan.
- **Oʻngda:** tanlangan davr uchun kunlar boʻyicha toʻlovlar jadvali.

---

## 20. Koʻp uchraydigan vazifalar: bosqichma-bosqich

### Yangi mashina qoʻshish va haydovchiga berish
1. **Avtomobillar** → **«+ Avtomobil qoʻshish»**. Marka, model, raqam, kunlik narxni toʻldiring → **«Avtomobil qoʻshish»**.
2. Mashina kartochkasi ochiladi → **«Haydovchi»** yorligʻi.
3. Haydovchi, sana va probegni tanlang → **«Mashinani berish»**.

### Haydovchi pul olib keldi
- **Tez usul:** **Haydovchilar hisoboti** → haydovchini tanlang → jadvalda kerakli kun yonida **«Berdi»** ni bosing. Qancha naqd va qancha karta orqali ekanini yozing → **«Yozib qoʻyish»**.
- **Yoki mashina orqali:** mashinani oching → **«Hisobot»** yorligʻi → «+ Daromad», «Ijara» toifasi, summa, usul, sana → **«Yozib qoʻyish»**.

### Kim qancha qarzdorligini koʻrish
- **Hammasi birdaniga:** **Haydovchilar hisoboti** → «Barcha haydovchilar»: davr uchun qarzlar jadvali.
- **Bitta haydovchi:** uni tanlang — qaysi sanagacha yopilgani va qancha qolgani yirik koʻrinadi.

### Dispetcher yozuvlarini tasdiqlash (administrator)
- **Topish:** **Bildirishnomalar** (yoki mashina kartochkasidagi sariq panel).
- **Bittalab tasdiqlash:** mashinani oching → «Amallar tarixi» → kerakli yozuv yonida **«Tasdiqlash»**.
- **Hammasini birdaniga:** **«Hammasini tasdiqlash»**.

### Mashina ishlamaganini belgilash
- Mashina → **«Dam olish kunlari»** yorligʻi → kunlarga bosing → **«Saqlash»**. Bu kunlarda ijara hisoblanmaydi.

### Ijara narxini oʻzgartirish (administrator)
- Mashina → **«Hisobot»** yorligʻi → «Ijara narxi» paneli.
- «Yangi narx» va «Amal qilish sanasi»ni yozing → **«Narxni oʻzgartirish»**.

### TXKni belgilash
- Mashina → **«Xizmat koʻrsatish»** yorligʻi.
- **Rejalashtirish:** turi, sana yoki probeg → **«Rejalashtirish»**.
- **Bajarilganda:** **«Bajarildi»**, narx va probeg — xarajat oʻzi yoziladi.

### Haydovchiga kabinetga kirish huquqini berish
- Haydovchi kartochkasi → **«Parol oʻrnatish»** → **«Parol oʻrnatish»**.
- Koʻrsatilgan sayt, login va parolni haydovchiga bering.

### Haydovchi ketdi
1. Mashina → «Haydovchi» yorligʻi → **«Mashinani qabul qilish»** (sana va probeg).
2. Haydovchi kartochkasi → **«Arxivga»**.
3. Uni butunlay oʻchirish kerak boʻlsa — **«Oʻchirish»** (faqat administrator).

### Mashina endi ishlamaydi
1. Agar u haydovchida boʻlsa — avval **«Mashinani qabul qilish»**.
2. Mashina kartochkasi → **«Arxivga»**. Qaytarish: **Avtomobillar → Arxiv → «Qaytarish»**.
3. **«Oʻchirish»** mashinani butun pul tarixi bilan birga oʻchiradi. Raqamlar kerak boʻlishi mumkin boʻlsa, arxiv yaxshiroq.

---

## 21. Maʼlumotnoma: toifalar, toʻlov usullari, holatlar

### Daromad toifalari
Ijara, Depozit, Boshqa daromad.

### Xarajat toifalari
Benzin / gaz, Taʼmir va ehtiyot qismlar, TXK, Jarimalar, Yuvish, Sugʻurta / hujjatlar, Boshqa.

### Toʻlov usullari
Naqd, Karta, Oʻtkazma, Click, Payme, Uzum.
Kunlar boʻyicha jadvallarda «Naqd» — alohida, qolgan hammasi — «Karta / oʻtkazma».

### Xizmat koʻrsatish turlari
Moy almashtirish, Taʼmir, Texnik koʻrik, Sugʻurta, Shinalar, Boshqa.

### Mashina holatlari

| Holat | Maʼnosi |
|---|---|
| **Boʻsh** | Mashina haydovchisiz |
| **Ijarada** | Mashina haydovchida |
| **Xizmat koʻrsatishda** | Mashina TXKda |
| **Arxiv** | Ishdan olingan |

### Pul yozuvlari holatlari

| Holat | Maʼnosi |
|---|---|
| **Tasdiqlashni kutmoqda** | Dispetcher yozuvi, hali yakunlarga kirmagan |
| **Tasdiqlangan** | Hisobotlarda hisobga olinadi |
