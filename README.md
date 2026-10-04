# RetroChatbot

Kendini farklı bir yılda sanan bir sohbet botu. **Zaman makinesi** ile beş dönem arasında
geçiş yaparsın; her dönemin hem kişiliği hem de arayüzü o yıla göre tasarlandı:

| Yıl | Bot | Arayüz |
|---|---|---|
| 1975 | **Kemal**, Beyoğlu'nda plak dükkânında | Ahşap masada daktilo kâğıdı, teleks yazışması |
| 1998 | **RetroBot**, internet kafede gece vardiyası | 90'lar kişisel web sitesi, Windows 95 sohbet penceresi |
| 2005 | **Ece**, liseli | Windows XP masaüstü, anlık mesajlaşma, "titreşim gönder" |
| 2030 | **Nova**, kişisel yapay zeka | Cam efektli modern arayüz, sesli sohbet |
| 2077 | **ZERO**, Neo-İstanbul'da bilgi simsarı | Neon ışıklı siberpunk terminal |

Cevaplar akışla gelir ve her dönemin hızında harf harf yazılır. Sohbetler tarayıcıda
saklanır ve her dönemden dosya olarak indirilebilir.

**Gizli sürprizler:** 1998 ya da 2005 sohbetinde `format c:` yazmayı dene, klavyede
↑↑↓↓←→←→BA tuşla (Konami kodu) ya da 1998'de fareyi gezdir.

**⚡ Zaman Buluşması:** iki dönemin botunu seçersin, birbirleriyle 6 mesajlık bir sohbet
yaparlar (ör. 1975'teki Kemal ile 2077'deki ZERO müzik konuşur). Her mesaj bir Gemini isteği kullanır.

- **Backend:** Python, FastAPI
- **Yapay zeka:** Google Gemini API (`google-genai`)
- **Frontend:** Saf HTML, CSS ve JavaScript (framework yok)

## Kurulum

1. Sanal ortamı oluştur ve paketleri kur:

   ```bash
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

2. `.env.example` dosyasını `.env` olarak kopyala ve Gemini API anahtarını yaz.
   Anahtarı [Google AI Studio](https://aistudio.google.com/apikey)'dan alabilirsin.

3. Sunucuyu başlat:

   ```bash
   .venv\Scripts\python.exe -m uvicorn main:app --reload
   ```

4. Tarayıcıda <https://retrochatbot.onrender.com/> adresini aç.

## Ayarlar (`.env`)

| Değişken | Açıklama |
|---|---|
| `GEMINI_API_KEY` | Gemini API anahtarın (zorunlu) |
| `GEMINI_MODEL` | Önce denenen model, ör. `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Virgülle ayrılmış yedek modeller. Ana modelin kotası dolarsa ya da model yoğunsa sırayla bunlar denenir. |
| `DATABASE_PATH` | SQLite dosyasının yolu (varsayılan: `data/retrochatbot.db`) |
| `CHAT_RATE_LIMIT` | Kişi başı sohbet sınırı, `istek/saniye` biçiminde (varsayılan: `30/300`) |

Ücretsiz planda kota **model başına** sayılır (ör. günde 20 istek). Bir modelin kotası dolunca
Google'ın bildirdiği bekleme süresi boyunca o model atlanır ve sıradaki modele geçilir.

## Testler

Backend testleri Gemini'ye gerçek istek atmaz; sahte cevaplarla çalışır, kotanı harcamaz.

```bash
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest
```

Kapsananlar: sohbet ve akış endpoint'leri, yedek model zinciri ve kota takibi, istek
sınırları, ziyaretçi defteri ve sayaç, dönem kişilikleri.

## İnternete yükleme (Render)

Proje [Render](https://render.com)'ın ücretsiz planına göre ayarlandı (`render.yaml`).

1. Projeyi GitHub'a gönder (`.env` dosyası `.gitignore`'da olduğu için API anahtarın gitmez).
2. Render'da **New → Blueprint** seç ve GitHub deposunu bağla. Render, `render.yaml`'ı okuyup
   servisi kendisi kurar.
3. Sorulduğunda `GEMINI_API_KEY` değerini gir.
4. Kurulum bitince Render sana `https://retrochatbot-xxxx.onrender.com` gibi bir adres verir.

Bilmen gerekenler:

- Ücretsiz planda servis 15 dakika boyunca kimse girmezse uykuya geçer; ilk açılış 30-60 saniye sürebilir.
- Ücretsiz planda disk kalıcı değildir: her yeniden başlatmada **ziyaretçi defteri ve sayaç sıfırlanır**.
  Kalıcı olması için Render'ın ücretli "Persistent Disk" özelliği ya da harici bir veritabanı gerekir.
- Siteyi açan herkes senin Gemini kotanı kullanır. Kişi başı sınır (`CHAT_RATE_LIMIT`) bunu yavaşlatır,
  ama linki geniş kitlelerle paylaşırsan günlük ücretsiz kota hızlı biter.

## Proje yapısı

```
main.py              FastAPI uygulaması ve API endpoint'leri
gemini_client.py     Gemini istekleri (normal ve akışlı), yedek model zinciri, kota takibi
database.py          SQLite: ziyaretçi defteri ve ziyaretçi sayacı (data/retrochatbot.db)
rate_limit.py        Bellek içi istek sınırlayıcı
prompts.py           Her dönemin kişiliği (system prompt), yıl anahtarıyla
static/index.html    Beş dönemin sayfa iskeleti
static/css/          base.css (ortak) + her dönemin kendi stili (era-1975.css ...)
static/js/core.js    Ortak sohbet mantığı: akış okuma, yazma efekti, kayıt
static/js/era-*.js   Her dönemin arayüzü
static/js/main.js    Zaman makinesi ve başlangıç
```

Yeni bir dönem eklemek için: `prompts.py`'a kişiliği, `index.html`'e bir bölüm,
`static/css/era-YYYY.css` ve `static/js/era-YYYY.js` dosyalarını ekleyip modülü
`main.js`'deki `ERAS` listesine koy.

## API

| Endpoint | Açıklama |
|---|---|
| `GET /` | Arayüz |
| `GET /healthz` | Sağlık kontrolü (Render için) |
| `POST /api/chat` | `{ "message": "...", "history": [...], "era": "1998" }` → `{ "reply": "..." }` |
| `POST /api/chat/stream` | Aynı istek; cevap NDJSON olarak parça parça gelir: `{"type": "chunk", "text": "..."}` ... `{"type": "done"}` |
| `POST /api/visit` | Ziyaretçi sayacını bir artırır (kalıcı) |
| `GET /api/guestbook` | Ziyaretçi defteri kayıtları, en yeniden eskiye |
| `POST /api/guestbook` | `{ "name": "...", "city": "...", "message": "..." }` ile deftere yazar (kişi başı 30 sn'de 1) |
