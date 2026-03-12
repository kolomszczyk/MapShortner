# MapShortner Electron (auto-update z GitHub Releases)

To jest minimalna aplikacja Electron z automatycznymi aktualizacjami przez `electron-updater`.

## 1) Przygotowanie repozytorium

1. Utwórz repo na GitHubie, np. `MapShortner`.
2. W pliku `package.json` podmień:
   - `build.publish[0].owner` -> Twój login GitHub
   - `build.publish[0].repo` -> nazwa repo
3. (Opcjonalnie) Zmień `build.appId` i `author`.

## 2) Instalacja i uruchomienie lokalne

```bash
npm install
npm run start
```

## 2a) Tryb developerski

Do pracy nad interfejsem i kodem lokalnym uruchamiaj:

```bash
npm run dev
```

W trybie dev:
- zmiany w `src/*.html`, `src/*.css`, `src/*.js` i `src/*.json` przeładowują okno automatycznie
- zmiany w `src/main.js`, `src/preload.js` i plikach z `src/main/` restartują aplikację automatycznie
- auto-update jest wyłączony, żeby nie mieszał w lokalnym developmentcie

## 3) Publikacja pierwszego release (ręcznie)

Pierwszy release możesz zrobić lokalnie:

```bash
export GH_TOKEN=twoj_personal_access_token
npm run release
```

Token musi mieć uprawnienia do tworzenia release (`repo`).

Ważne:
- Auto-update wymaga **publicznego release typu `release`** (nie sam tag i nie draft).
- W repo jest ustawione `build.publish.releaseType = "release"`, żeby wymusić poprawny typ publikacji.

## 4) Automatyczne release przez GitHub Actions

Workflow jest w `.github/workflows/release.yml` i uruchamia się po push taga `v*`.

Przykład:

```bash
npm version patch
git push origin main --follow-tags
```

To utworzy tag typu `v0.1.1` i pipeline zbuduje instalatory oraz opublikuje release.

## 5) Jak działa auto-update w aplikacji

- Po starcie aplikacja sprawdza, czy na GitHub Releases jest nowsza wersja.
- Jeśli znajdzie nowszy release, pobierze aktualizację automatycznie.
- Po zakonczeniu pobierania aplikacja sama uruchomi instalacje i zrobi restart.

## 6) Jak przetestować aktualizację

### Test lokalny samego ekranu pobierania

To testuje tylko UI statusu aktualizacji, bez prawdziwego release i bez pobierania plikow updatera.

1. Uruchom aplikacje w trybie developerskim:

```bash
npm run dev
```

2. Otworz dashboard i przejdz do sekcji `Aktualizacje aplikacji`.
3. Uzyj przyciskow:
   - `Symuluj sprawdzanie`
   - `Test popupu wersji`
   - `Test popupu z tekstem`
   - `Symuluj pobieranie`
   - `Symuluj pobrano`
   - `Symuluj blad`
   - `Reset testu`
4. `Symuluj pobieranie` pokazuje ten sam ekran/status, ktory uzywany jest dla prawdziwego flow aktualizacji.
5. `Test popupu wersji` otwiera sam popup nowej wersji bez dodatkowego tekstu.
6. `Test popupu z tekstem` otwiera popup ze specjalna wiadomoscia, tak jak dla release z opisem.

### Test end-to-end z prawdziwym release

1. Zainstaluj starsza wersje aplikacji, np. `0.5.1`.
2. Zwieksz wersje w repo:

```bash
npm version patch
```

3. Opublikuj release z assetami updatera:

```bash
git push origin main --follow-tags
```

albo lokalnie:

```bash
export GH_TOKEN=twoj_personal_access_token
npm run release
```

4. Uruchom ponownie zainstalowana starsza wersje aplikacji.
5. Sprawdz sekcje `Aktualizacje aplikacji` oraz gorny status aplikacji.
6. Po wykryciu nowszego release aplikacja rozpocznie pobieranie, a po zakonczeniu wykona instalacje i restart.

### Specjalna wiadomosc w popupie nowej wersji

- Popup `Nowa wersja` pokazuje sie tylko wtedy, gdy updater wykryje nowszy release.
- Jesli release ma opis na GitHubie, jego tresc zostanie pokazana jako specjalna wiadomosc.
- Jesli opis release jest pusty, popup pokaze zwykly komunikat o dostepnej wersji.
- Po zamknieciu popupu mozna go otworzyc ponownie przyciskiem `Pokaz wiadomosc wersji` w dashboardzie.

## Uwaga

- Auto-update działa dla aplikacji zbudowanej przez `electron-builder` (nie dla `npm run start`).
- `npm run dev` sluzy tylko do lokalnego testu interfejsu aktualizacji przez symulacje.
- Na Linuxie używany jest target `AppImage`, na Windowsie `NSIS`.

## Diagnostyka błędu `Unable to find latest version on GitHub` / `406`

Jeśli pojawia się błąd podobny do:
- `ERR_UPDATER_LATEST_VERSION_NOT_FOUND`
- `Cannot parse releases feed`

to zwykle oznacza, że na GitHub jest tylko tag (albo draft), ale nie ma publicznego release z assetami updatera.

Sprawdź, czy dla wersji są opublikowane pliki:
- `latest-linux.yml` (Linux)
- `*.AppImage` (Linux) / instalator `*.exe` (Windows)
