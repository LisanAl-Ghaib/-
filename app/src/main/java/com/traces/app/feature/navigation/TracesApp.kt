package com.traces.app.feature.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.traces.app.R
import com.traces.app.feature.collection.CollectionScreen
import com.traces.app.feature.home.HomeScreen
import com.traces.app.feature.map.MapScreen
import com.traces.app.feature.mapdetail.MapDetailScreen
import com.traces.app.feature.profile.ProfileScreen
import com.traces.app.feature.settings.SettingsScreen
import com.traces.app.feature.splash.SplashScreen

/**
 * Four tabs, in the order they read on the bar. Home is the start destination:
 * the app opens on the feed, not on the globe.
 */
private enum class Tab(val route: String, val labelRes: Int, val icon: ImageVector) {
    World("world", R.string.nav_world, Icons.Outlined.Public),
    Home("home", R.string.nav_home, Icons.Outlined.Search),
    Collection("collection", R.string.nav_collection, Icons.Outlined.Layers),
    Profile("profile", R.string.nav_profile, Icons.Outlined.Person),
}

private const val MAP_DETAIL_ROUTE = "map/{mapId}"
private const val MAP_ID_ARG = "mapId"
private const val PROFILE_ROUTE = "profile/{authorId}"
private const val AUTHOR_ID_ARG = "authorId"
private const val SETTINGS_ROUTE = "settings"

@Composable
fun TracesApp() {
    var splashVisible by remember { mutableStateOf(true) }
    val navController = rememberNavController()

    Box(Modifier.fillMaxSize()) {
        MainScaffold(navController)

        AnimatedVisibility(
            visible = splashVisible,
            enter = fadeIn(),
            exit = fadeOut(animationSpec = tween(durationMillis = 320)),
        ) {
            SplashScreen(onFinished = { splashVisible = false })
        }
    }
}

@Composable
private fun MainScaffold(navController: NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    fun openMap(mapId: String) = navController.navigate("map/$mapId")
    fun openProfile(authorId: String) = navController.navigate("profile/$authorId")

    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    val selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(stringResource(tab.labelRes)) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Tab.Home.route,
            modifier = Modifier.padding(bottom = innerPadding.calculateBottomPadding()),
        ) {
            composable(Tab.World.route) { MapScreen() }

            composable(Tab.Home.route) {
                HomeScreen(
                    onOpenWorldMap = {
                        navController.navigate(Tab.World.route) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    onOpenMap = ::openMap,
                )
            }

            composable(Tab.Collection.route) { CollectionScreen(onOpenMap = ::openMap) }

            composable(Tab.Profile.route) {
                ProfileScreen(
                    onOpenSettings = { navController.navigate(SETTINGS_ROUTE) },
                    onOpenProfile = ::openProfile,
                )
            }

            composable(SETTINGS_ROUTE) {
                SettingsScreen(onBack = { navController.popBackStack() })
            }

            composable(
                route = PROFILE_ROUTE,
                arguments = listOf(navArgument(AUTHOR_ID_ARG) { type = NavType.StringType }),
            ) { entry ->
                ProfileScreen(
                    authorId = entry.arguments?.getString(AUTHOR_ID_ARG),
                    onOpenProfile = ::openProfile,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(
                route = MAP_DETAIL_ROUTE,
                arguments = listOf(navArgument(MAP_ID_ARG) { type = NavType.StringType }),
            ) { entry ->
                MapDetailScreen(
                    mapId = entry.arguments?.getString(MAP_ID_ARG).orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
