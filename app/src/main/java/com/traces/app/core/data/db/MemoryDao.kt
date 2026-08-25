package com.traces.app.core.data.db

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
    // nothing on a database this size.

    @Query(
        """
        SELECT * FROM memories
        WHERE visibility = 'PUBLIC'
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
          AND happenedYear BETWEEN :fromYear AND :toYear
          AND (:query = '' OR textLower LIKE '%' || :query || '%')
          AND (:authorId IS NULL OR authorId = :authorId)
          AND (:includeDemo = 1 OR isSeed = 0)
        """
    )
    fun observePublicInBounds(
        south: Double, north: Double, west: Double, east: Double,
        fromYear: Int, toYear: Int, query: String, authorId: String?, includeDemo: Boolean,
    ): Flow<List<MemoryEntity>>

    @Query(
        """
        SELECT * FROM memories
        WHERE authorId = :ownerId
          AND inPersonalMap = 1
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
          AND happenedYear BETWEEN :fromYear AND :toYear
          AND (:query = '' OR textLower LIKE '%' || :query || '%')
        """
    )
    fun observeOwnInBounds(
        ownerId: String,
        south: Double, north: Double, west: Double, east: Double,
        fromYear: Int, toYear: Int, query: String,
    ): Flow<List<MemoryEntity>>

    @Query(
        """
        SELECT COUNT(*) FROM memories
        WHERE visibility = 'PUBLIC'
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
          AND happenedYear BETWEEN :fromYear AND :toYear
          AND (:query = '' OR textLower LIKE '%' || :query || '%')
          AND (:authorId IS NULL OR authorId = :authorId)
          AND (:includeDemo = 1 OR isSeed = 0)
        """
    )
    fun countPublicInBounds(
        south: Double, north: Double, west: Double, east: Double,
        fromYear: Int, toYear: Int, query: String, authorId: String?, includeDemo: Boolean,
    ): Flow<Int>

    @Query(
        """
        SELECT COUNT(*) FROM memories
        WHERE authorId = :ownerId
          AND inPersonalMap = 1
          AND lat BETWEEN :south AND :north
          AND lng BETWEEN :west AND :east
          AND happenedYear BETWEEN :fromYear AND :toYear
          AND (:query = '' OR textLower LIKE '%' || :query || '%')
        """
    )
    fun countOwnInBounds(
        ownerId: String,
        south: Double, north: Double, west: Double, east: Double,
        fromYear: Int, toYear: Int, query: String,
    ): Flow<Int>

    // --- Author queries ---------------------------------------------------

    @Query(
        """
        SELECT * FROM memories
        WHERE authorId = :ownerId
          AND happenedYear BETWEEN :fromYear AND :toYear
          AND (:query = '' OR textLower LIKE '%' || :query || '%')
        ORDER BY happenedYear DESC, happenedMonth DESC, happenedDay DESC, createdAt DESC
        """
    )
    fun observeOwn(ownerId: String, fromYear: Int, toYear: Int, query: String): Flow<List<MemoryEntity>>

    @Query("SELECT COUNT(*) FROM memories WHERE authorId = :ownerId")
    fun countOwn(ownerId: String): Flow<Int>

    @Query(
        """
        SELECT DISTINCT authorId, authorName FROM memories
        WHERE visibility = 'PUBLIC' AND (:includeDemo = 1 OR isSeed = 0)
        ORDER BY authorName
        """
    )
    fun observeAuthors(includeDemo: Boolean): Flow<List<AuthorRow>>

    @Query("SELECT COUNT(*) FROM memories WHERE isSeed = 1")
    fun countDemo(): Flow<Int>

    @Query("DELETE FROM memories WHERE isSeed = 1")
    suspend fun deleteAllDemo()

    @Query("UPDATE memories SET authorName = :name WHERE authorId = :ownerId")
    suspend fun renameAuthor(ownerId: String, name: String)

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

    /** Every point pinned to one themed map, newest experience first. */
    @Query(
        """
        SELECT * FROM memories
        WHERE mapId = :mapId
        ORDER BY happenedYear DESC, happenedMonth DESC, happenedDay DESC, createdAt DESC
        """
    )
    fun observeByMap(mapId: String): Flow<List<MemoryEntity>>

    @Query("UPDATE memories SET mapId = NULL WHERE mapId = :mapId")
    suspend fun detachFromMap(mapId: String)

    // --- Maintenance ------------------------------------------------------

    @Query("SELECT id, text FROM memories")
    suspend fun allTexts(): List<TextRow>

    @Query("UPDATE memories SET textLower = :textLower WHERE id = :id")
    suspend fun setTextLower(id: String, textLower: String)

    // --- People -----------------------------------------------------------

    /** One row per person who has written anything, with their totals. */
    @Query(
        """
        SELECT authorId, authorName,
               COUNT(*) AS memoryCount,
               MIN(happenedYear) AS earliestYear
        FROM memories
        WHERE (:includeDemo = 1 OR isSeed = 0)
        GROUP BY authorId, authorName
        ORDER BY memoryCount DESC
        """
    )
    fun observeProfiles(includeDemo: Boolean): Flow<List<ProfileRow>>

    /** Public points by one person, for viewing their profile. */
    @Query(
        """
        SELECT * FROM memories
        WHERE authorId = :authorId AND (visibility = 'PUBLIC' OR :authorId = :ownerId)
        ORDER BY happenedYear DESC, happenedMonth DESC, happenedDay DESC, createdAt DESC
        """
    )
    fun observeVisibleByAuthor(authorId: String, ownerId: String): Flow<List<MemoryEntity>>
}

data class AuthorRow(val authorId: String, val authorName: String)

data class ProfileRow(
    val authorId: String,
    val authorName: String,
    val memoryCount: Int,
    val earliestYear: Int?,
)

data class TextRow(val id: String, val text: String)
