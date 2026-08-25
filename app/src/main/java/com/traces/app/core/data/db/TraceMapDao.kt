package com.traces.app.core.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

private const val WITH_COUNT =
    "SELECT m.*, (SELECT COUNT(*) FROM memories WHERE mapId = m.id) AS pointCount FROM maps m"

@Dao
interface TraceMapDao {

    /** Everything discoverable: public maps plus the user's own private ones. */
    @Query(
        """
        $WITH_COUNT
        WHERE (m.visibility = 'PUBLIC' OR m.ownerId = :ownerId)
          AND (:query = '' OR m.titleLower LIKE '%' || :query || '%')
          AND (:includeDemo = 1 OR m.isSeed = 0)
        ORDER BY pointCount DESC, m.createdAt DESC
        """
    )
    fun observeDiscoverable(ownerId: String, query: String, includeDemo: Boolean): Flow<List<TraceMapWithCount>>

    /** The collection tab: maps the user owns or takes part in. */
    @Query(
        """
        $WITH_COUNT
        WHERE m.ownerId = :ownerId OR m.isMember = 1
        ORDER BY m.isPinned DESC, m.createdAt DESC
        """
    )
    fun observeCollection(ownerId: String): Flow<List<TraceMapWithCount>>

    @Query("$WITH_COUNT WHERE m.id = :id")
    fun observeById(id: String): Flow<TraceMapWithCount?>

    @Query("$WITH_COUNT WHERE m.id = :id")
    suspend fun getById(id: String): TraceMapWithCount?

    @Query("SELECT COUNT(*) FROM maps WHERE isSeed = 1")
    fun countDemo(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(map: TraceMapEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(maps: List<TraceMapEntity>)

    @Update
    suspend fun update(map: TraceMapEntity)

    @Query("UPDATE maps SET isPinned = :pinned WHERE id = :id")
    suspend fun setPinned(id: String, pinned: Boolean)

    @Query("UPDATE maps SET isMember = :member WHERE id = :id")
    suspend fun setMember(id: String, member: Boolean)

    @Query("DELETE FROM maps WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM maps WHERE isSeed = 1")
    suspend fun deleteAllDemo()

    @Query("SELECT COUNT(*) FROM maps")
    suspend fun totalCount(): Int
}
