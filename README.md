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

### 2b) Podglad okna aktualizacji w dev (flaga CLI)

Jesli chcesz podejrzec nowy maly ekran aktualizacji na starcie (bez prawdziwego pobierania release), uzyj flagi:

```bash
npm run dev -- --dev-updater-preview
```

Dostepne scenariusze:

```bash
npm run dev -- --dev-updater-preview=full
npm run dev -- --dev-updater-preview=no-update
npm run dev -- --dev-updater-preview=offline
```

Uwagi:
- Flaga dziala tylko w trybie dev (`npm run dev`).
- `full` pokazuje sprawdzanie + pobieranie z procentami + instalowanie (symulacja).
- `no-update` symuluje brak nowej wersji.
- `offline` symuluje brak internetu / blad aktualizacji.
- W tym trybie aplikacja nie pobiera realnej aktualizacji i nie robi restartu systemowego.

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
- W malym oknie startowym mozesz kliknac `Pomin pobieranie`, aby od razu przejsc do aplikacji.
- Po pominieciu aktualizacja moze dokonczyc sie w tle, a instalacje wykonasz po zamknieciu aplikacji lub przyciskiem `Instaluj teraz`.

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

## Snippet VBA do Accessa (kopiuj-wklej)

Wklej ten kod do **modulu standardowego** w Accessie (`Alt+F11` -> `Insert` -> `Module`).

```vb
Option Compare Database
Option Explicit

Private Const PERSON_FORM_NAME_PRIMARY As String = "Kontakt wprowadzanie i kontrola"
Private Const PERSON_FORM_NAME_FALLBACK As String = "Osoby"
Private Const PERSON_KEY_FIELD As String = "ID"

Public Function OpenEntity(ByVal entityName As String, ByVal recordId As Variant) As String
   On Error GoTo HandleError

   Dim targetFormName As String
   targetFormName = ResolveExistingFormName(PERSON_FORM_NAME_PRIMARY, PERSON_FORM_NAME_FALLBACK)

   Select Case LCase$(Trim$(entityName))
      Case "osoba", "person"
         If Len(targetFormName) = 0 Then
            OpenEntity = "error:form-not-found"
         Else
            OpenEntity = OpenRecordInForm(targetFormName, PERSON_KEY_FIELD, recordId)
         End If
      Case Else
         OpenEntity = "not-found:entity"
   End Select
   Exit Function

HandleError:
   OpenEntity = "error:" & Err.Number & ":" & Err.Description
End Function

Public Function OpenRecordInForm(ByVal formName As String, ByVal keyField As String, ByVal recordId As Variant) As String
   On Error GoTo HandleError

   DoCmd.OpenForm formName, acNormal

   Dim frm As Form
   Dim rs As Object
   Set frm = Forms(formName)
   Set rs = frm.RecordsetClone

   rs.FindFirst BuildFindCriteria(keyField, recordId)
   If rs.NoMatch Then
      OpenRecordInForm = "not-found:record"
   Else
      frm.Bookmark = rs.Bookmark
      frm.SetFocus
      OpenRecordInForm = "ok"
   End If

Cleanup:
   On Error Resume Next
   If Not rs Is Nothing Then rs.Close
   Set rs = Nothing
   Set frm = Nothing
   Exit Function

HandleError:
   OpenRecordInForm = "error:" & Err.Number & ":" & Err.Description
   Resume Cleanup
End Function

Private Function ResolveExistingFormName(ParamArray candidates() As Variant) As String
   Dim index As Long
   Dim candidate As String

   For index = LBound(candidates) To UBound(candidates)
      candidate = Trim$(CStr(candidates(index)))
      If Len(candidate) > 0 And FormExistsByName(candidate) Then
         ResolveExistingFormName = candidate
         Exit Function
      End If
   Next index

   ResolveExistingFormName = ""
End Function

Private Function FormExistsByName(ByVal formName As String) As Boolean
   On Error GoTo HandleError

   Dim formEntry As Object
   For Each formEntry In CurrentProject.AllForms
      If StrComp(CStr(formEntry.Name), formName, vbTextCompare) = 0 Then
         FormExistsByName = True
         Exit Function
      End If
   Next formEntry

   FormExistsByName = False
   Exit Function

HandleError:
   FormExistsByName = False
End Function

Private Function BuildFindCriteria(ByVal keyField As String, ByVal recordId As Variant) As String
   If IsNumeric(recordId) Then
      BuildFindCriteria = "[" & keyField & "]=" & CLng(recordId)
   Else
      BuildFindCriteria = "[" & keyField & "]='" & Replace(CStr(recordId), "'", "''") & "'"
   End If
End Function
```

## Uwaga

- Auto-update działa dla aplikacji zbudowanej przez `electron-builder` (nie dla `npm run start`).
- `npm run dev` sluzy tylko do lokalnego testu interfejsu aktualizacji przez symulacje.
- Na Linuxie używany jest target `AppImage`, na Windowsie `NSIS`.
- Aplikacja działa w trybie pojedynczej instancji: kolejne uruchomienie nie tworzy nowego procesu okna, tylko aktywuje już otwarte okno.

## Diagnostyka błędu `Unable to find latest version on GitHub` / `406`

Jeśli pojawia się błąd podobny do:
- `ERR_UPDATER_LATEST_VERSION_NOT_FOUND`
- `Cannot parse releases feed`

to zwykle oznacza, że na GitHub jest tylko tag (albo draft), ale nie ma publicznego release z assetami updatera.

Sprawdź, czy dla wersji są opublikowane pliki:
- `latest-linux.yml` (Linux)
- `*.AppImage` (Linux) / instalator `*.exe` (Windows)
