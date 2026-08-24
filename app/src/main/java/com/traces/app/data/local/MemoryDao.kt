package com.traces.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface MemoryDao {

    // --- Viewport queries -------------------------------------------------
    // v0 filters by plain lat/lng ranges. Geohash prefix ranges would need
    // neighbour-cell computation and false-positive filtering, which buys
    // nothing on a fifty-row local database.

    @Query(
        """
        SELECT * FROM memories
        WHERE visibility = 'PUBLIC'
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
        """
    )
    fun observePublicInBounds(south: Double, north: Double, west: Double, east: Double): Flow<List<MemoryEntity>>

    @Query(
        """
        SELECT * FROM memories
        WHERE authorId = :authorId
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
        """
    )
    fun observeAuthorInBounds(
        authorId: String,
        south: Double,
        north: Double,
        west: Double,
        east: Double,
    ): Flow<List<MemoryEntity>>

    @Query(
        """
        SELECT COUNT(*) FROM memories
        WHERE visibility = 'PUBLIC'
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
        """
    )
    fun countPublicInBounds(south: Double, north: Double, west: Double, east: Double): Flow<Int>

    @Query(
        """
        SELECT COUNT(*) FROM memories
        WHERE authorId = :authorId
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
        """
    )
    fun countAuthorInBounds(
        authorId: String,
        south: Double,
        north: Double,
        west: Double,
        east: Double,
    ): Flow<Int>

    // --- Author queries ---------------------------------------------------

    @Query("SELECT * FROM memories WHERE authorId = :authorId ORDER BY happenedYear DESC, happenedMonth DESC, happenedDay DESC, createdAt DESC")
    fun observeByAuthor(authorId: String): Flow<List<MemoryEntity>>

    @Query("SELECT COUNT(*) FROM memories WHERE authorId = :authorId")
    fun countByAuthor(authorId: String): Flow<Int>

    @Query("UPDATE memories SET authorName = :name WHERE authorId = :authorId")
    suspend fun renameAuthor(authorId: String, name: String)

    // --- Single record ----------------------------------------------------

    @Query("SELECT * FROM memories WHERE id = :id")
    suspend fun getById(id: String): MemoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(memory: MemoryEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(memories: List<MemoryEntity>)

    @Update
    suspend fun update(memory: MemoryEntity)

    @Query("DELETE FROM memories WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT COUNT(*) FROM memories")
    suspend fun totalCount(): Int
}
