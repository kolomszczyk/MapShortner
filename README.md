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

- Po starcie appka wywołuje `checkForUpdatesAndNotify()`.
- Jeśli znajdzie nowszy release na GitHubie, pobierze aktualizację.
- Po pobraniu pokaże komunikat i można kliknąć „Zainstaluj i uruchom ponownie”.

## 6) Jak przetestować aktualizację

1. Zainstaluj wersję `0.1.0`.
2. Zwiększ wersję (`npm version patch`) i opublikuj `0.1.1`.
3. Uruchom ponownie aplikację `0.1.0` i sprawdź status update.

## Uwaga

- Auto-update działa dla aplikacji zbudowanej przez `electron-builder` (nie dla `npm run start`).
- Na Linuxie używany jest target `AppImage`, na Windowsie `NSIS`.

## Diagnostyka błędu `Unable to find latest version on GitHub` / `406`

Jeśli pojawia się błąd podobny do:
- `ERR_UPDATER_LATEST_VERSION_NOT_FOUND`
- `Cannot parse releases feed`

to zwykle oznacza, że na GitHub jest tylko tag (albo draft), ale nie ma publicznego release z assetami updatera.

Sprawdź, czy dla wersji są opublikowane pliki:
- `latest-linux.yml` (Linux)
- `*.AppImage` (Linux) / instalator `*.exe` (Windows)
