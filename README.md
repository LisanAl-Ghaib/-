# Traces

Карта мира, на которой отмечают точные координаты и записывают связанное с ними
воспоминание. Две карты: мировая (все публичные записи) и личная (свои, включая
приватные).

Это прототип v0: **без бэкенда и без авторизации**. Данные лежат в Room, фото —
в приватной папке приложения, мировая карта заполняется сид-файлом из assets.
Цель версии — проверить UX (приятно ли ставить пины и писать), а не
инфраструктуру.

## Быстрый старт

1. Получи ключ Google Maps (см. ниже) и положи его в `local.properties`.
2. Открой проект в Android Studio (Ladybug или новее) либо собери из
   консоли: `./gradlew :app:assembleDebug`.
3. Запусти на устройстве или эмуляторе с Google Play Services (образ
   «Google Play», не «AOSP» — иначе карта не отрисуется).

Wrapper в репозитории (Gradle 8.9), Android SDK нужен свой: `sdk.dir` в
`local.properties` Android Studio пропишет сама.

## Google Maps API-ключ

1. Открой [Google Cloud Console](https://console.cloud.google.com/) и создай
   проект (или выбери существующий).
2. **APIs & Services → Library** → включи **Maps SDK for Android**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Нажми на созданный ключ и ограничь его: *Application restrictions* →
   **Android apps**, добавь пакет `com.traces.app` и SHA-1 отладочного
   хранилища. SHA-1 берётся так:

   ```
   keytool -list -v -keystore ~/.android/debug.keystore \
           -alias androiddebugkey -storepass android -keypass android
   ```

   В *API restrictions* оставь только **Maps SDK for Android**.
5. Добавь ключ в `local.properties` в корне проекта (файл в `.gitignore`,
   в репозиторий он не попадёт):

   ```
   MAPS_API_KEY=AIza...
   ```

`secrets-gradle-plugin` подставит значение в манифест вместо плейсхолдера
`${MAPS_API_KEY}`. Если ключа нет, сборка не упадёт: подхватится заглушка из
`local.defaults.properties`, но карта будет пустой серой сеткой.

## Архитектура

```
ui/          Compose-экраны и ViewModel'и (MVVM)
domain/      Модели, интерфейс репозитория, geohash — без зависимостей от Android
data/        Room, SharedPreferences, файловое хранилище фото, загрузчик сидов
location/    Обёртка над FusedLocationProviderClient
di/          AppContainer — ручной граф зависимостей вместо Hilt
```

Единственный шов между приложением и хранилищем — интерфейс
`domain/repository/MemoryRepository`. Всё, что выше него, о хранилище ничего не
знает; переход на Firestore — это второй класс рядом с `LocalMemoryRepository`
и одна строка в `AppContainer`.

Три решения, которые стоит знать заранее:

- **Фото не хранятся как `content://`.** URI из photo picker несёт временное
  разрешение на чтение, которое умирает вместе с процессом, а
  `takePersistableUriPermission` на нём не работает. Байты копируются в
  `filesDir/photos/<uuid>.jpg`, в базу пишется относительный путь. Жизненным
  циклом файлов владеет репозиторий, поэтому запись и её байты не могут
  разъехаться.
- **`geohash` вычисляется, но не используется для поиска.** Колонка нужна, чтобы
  локальная схема уже совпадала с будущим документом Firestore. Запрос по
  видимой области идёт по `lat`/`lng` BETWEEN.
- **Сиды грузятся не из `RoomDatabase.Callback`.** Вызов DAO внутри `onCreate`
  через тот же `getInstance()` даёт дедлок на ещё не достроенной базе. Вставка
  происходит из `AppContainer` на application-scope ровно один раз, под флагом
  в `SharedPreferences`.

## Дерево файлов

```
Traces/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── local.defaults.properties          # заглушка ключа, чтобы сборка не падала
├── gradlew / gradlew.bat
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/{gradle-wrapper.jar,gradle-wrapper.properties}
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── assets/seed_memories.json   # 40 записей по Парижу, 1975–2026
        ├── res/
        │   ├── values/{strings,colors,themes}.xml
        │   ├── values-night/themes.xml
        │   ├── raw/{map_style_light,map_style_dark}.json
        │   ├── drawable/ic_launcher_foreground.xml
        │   ├── mipmap-anydpi-v26/{ic_launcher,ic_launcher_round}.xml
        │   └── xml/{backup_rules,data_extraction_rules}.xml
        └── java/com/traces/app/
            ├── TracesApplication.kt
            ├── MainActivity.kt
            ├── di/AppContainer.kt
            ├── domain/
            │   ├── model/Memory.kt              # Memory, MemoryDraft, PhotoInput, GeoBounds
            │   ├── repository/MemoryRepository.kt
            │   └── geo/Geohash.kt
            ├── data/
            │   ├── local/{MemoryEntity,MemoryDao,TracesDatabase,UserPreferences}.kt
            │   ├── photo/PhotoStorage.kt
            │   ├── seed/{SeedMemoryJson,SeedLoader}.kt
            │   └── repository/LocalMemoryRepository.kt
            ├── location/LocationProvider.kt
            └── ui/
                ├── TracesApp.kt                 # NavHost + нижняя навигация
                ├── UiState.kt
                ├── theme/{Color,Type,Theme}.kt
                ├── common/{LocalAppContainer,MemoryFormat}.kt
                ├── map/{MapScreen,MapViewModel}.kt
                ├── memory/{CreateMemorySheet,CreateMemoryViewModel,MemoryDetailSheet}.kt
                └── profile/{ProfileScreen,ProfileViewModel}.kt
```

## Что сознательно не реализовано

Прототип проверяет UX, поэтому ниже — список того, что придётся написать при
переходе на Firestore, и того, что осознанно упрощено.

**Потребует замены при переходе на Firestore**

1. **Запрос по префиксным диапазонам geohash.** Сейчас видимая область
   выбирается через `lat`/`lng` BETWEEN. Корректная версия для Firestore
   требует вычисления девяти соседних ячеек, подбора точности под размер
   области и отсева ложных попаданий. Колонка `geohash` уже заполняется, так
   что менять придётся только запрос.
2. **Загрузка фото в Storage.** Сейчас байты копируются в `filesDir`, а в базу
   идёт относительный путь. Понадобятся загрузка в Cloud Storage, хранение
   download URL, кеш и стратегия на случай обрыва загрузки.
3. **Авторизация.** `authorId` — константа `"local_user"`, `authorName` живёт в
   `SharedPreferences`. Нужен Firebase Auth, реальный uid и миграция уже
   написанных локальных записей на этот uid.
4. **Серверные правила приватности.** Сейчас `visibility = PRIVATE` отсекается
   в SQL-запросе, то есть на клиенте. В Firestore это должно стать правилом
   безопасности: чужие приватные документы не должны вообще покидать сервер.
5. **Пагинация.** Все записи в границах экрана грузятся одним запросом. На
   удалённой базе нужны курсор, лимит и подгрузка по мере панорамирования.
6. **Синхронизация офлайн-правок.** Нет очереди операций, разрешения
   конфликтов и признака «не отправлено». Локальная правка сейчас просто
   применяется к Room.

**Упрощено сознательно (не связано с бэкендом)**

7. **Тестов нет** — по условию прототипа.
8. **Маркеры отрисовываются стандартным рендерером** maps-compose. Свой цвет
   пина потребует `ClusterRenderer` с `BitmapDescriptorFactory`.
9. **Ошибка копирования фото не показывается пользователю** — она пишется в
   лог, а запись сохраняется без фотографии.
10. **Нет обработки поворота экрана в редакторе**: черновик живёт в ViewModel,
    но не в `SavedStateHandle`, так что при смерти процесса он теряется.
11. **Миграций Room нет** — база пересоздаётся (`fallbackToDestructiveMigration`).
12. **Один язык.** Интерфейс только на русском, `strings.xml` без переводов.
