package com.traces.app.core.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [MemoryEntity::class], version = 2, exportSchema = true)
@TypeConverters(Converters::class)
abstract class TracesDatabase : RoomDatabase() {

    abstract fun memoryDao(): MemoryDao

    companion object {
        private const val NAME = "traces.db"

        /**
         * v2 replaces the single photoPath with a JSON photoPaths list and adds
         * the lowercased search column. Written as a real migration rather than
         * a destructive fallback so anyone already carrying records keeps them.
         *
         * lower() folds ASCII only; Cyrillic textLower is fixed up by the
         * backfill in AppContainer.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE memories_new (
                        id TEXT NOT NULL,
                        authorId TEXT NOT NULL,
                        authorName TEXT NOT NULL,
                        lat REAL NOT NULL,
                        lng REAL NOT NULL,
                        geohash TEXT NOT NULL,
                        text TEXT NOT NULL,
                        textLower TEXT NOT NULL,
                        photoPaths TEXT NOT NULL,
                        happenedYear INTEGER NOT NULL,
                        happenedMonth INTEGER,
                        happenedDay INTEGER,
                        createdAt INTEGER NOT NULL,
                        visibility TEXT NOT NULL,
                        isSeed INTEGER NOT NULL,
                        PRIMARY KEY(id)
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO memories_new (
                        id, authorId, authorName, lat, lng, geohash, text, textLower,
                        photoPaths, happenedYear, happenedMonth, happenedDay,
                        createdAt, visibility, isSeed
                    )
                    SELECT id, authorId, authorName, lat, lng, geohash, text, lower(text),
                           CASE WHEN photoPath IS NOT NULL AND photoPath <> ''
                                THEN '["' || photoPath || '"]'
                                ELSE '[]' END,
                           happenedYear, happenedMonth, happenedDay,
                           createdAt, visibility, isSeed
                    FROM memories
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE memories")
                db.execSQL("ALTER TABLE memories_new RENAME TO memories")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_memories_lat ON memories (lat)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_memories_lng ON memories (lng)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_memories_authorId ON memories (authorId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_memories_happenedYear ON memories (happenedYear)")
            }
        }

        @Volatile
        private var instance: TracesDatabase? = null

        /**
         * No RoomDatabase.Callback here on purpose: calling a DAO from
         * onCreate() through this same getInstance() deadlocks on a database
         * that is still being built. Seeding happens from AppContainer instead.
         */
        fun getInstance(context: Context): TracesDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, TracesDatabase::class.java, NAME)
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }
    }
}
