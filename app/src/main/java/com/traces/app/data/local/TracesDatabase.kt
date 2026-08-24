package com.traces.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [MemoryEntity::class], version = 1, exportSchema = true)
abstract class TracesDatabase : RoomDatabase() {

    abstract fun memoryDao(): MemoryDao

    companion object {
        private const val NAME = "traces.db"

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
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
