# RetroChatbot

Kendini farklı bir yılda sanan bir sohbet botu. Varsayılan olarak **1998**'de yaşayan
**RetroBot** ile konuşursun; "Modernleştir" butonuna basınca **2030**'dan gelen **Nova**'ya
geçersin. Her dönemin hem kişiliği hem de arayüzü o yıla göre tasarlandı.

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

4. Tarayıcıda <http://localhost:8000> adresini aç.

## Ayarlar (`.env`)

| Değişken | Açıklama |
|---|---|
| `GEMINI_API_KEY` | Gemini API anahtarın (zorunlu) |
| `GEMINI_MODEL` | Önce denenen model, ör. `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Virgülle ayrılmış yedek modeller. Ana modelin kotası dolarsa ya da model yoğunsa sırayla bunlar denenir. |

Ücretsiz planda kota **model başına** sayılır (ör. günde 20 istek). Bir modelin kotası dolunca
Google'ın bildirdiği bekleme süresi boyunca o model atlanır ve sıradaki modele geçilir.

## Proje yapısı

```
main.py            FastAPI uygulaması ve API endpoint'leri
gemini_client.py   Gemini istekleri, yedek model zinciri ve kota takibi
prompts.py         Her dönemin kişiliği (system prompt)
static/            Arayüz: index.html, style.css (1998), future.css (2030), script.js
```

## API

| Endpoint | Açıklama |
|---|---|
| `GET /` | Arayüz |
| `POST /api/chat` | `{ "message": "...", "history": [...], "era": "retro" \| "future" }` → `{ "reply": "..." }` |
| `POST /api/visit` | Ziyaretçi sayacını bir artırır |
