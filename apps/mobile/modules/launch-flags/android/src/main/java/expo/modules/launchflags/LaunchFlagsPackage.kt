package expo.modules.launchflags

import android.app.Activity
import android.content.Context
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Keeps the extras of the intent that launched the app, before any JavaScript runs, so the app can
 * read them as it starts. UI tests pass launch arguments this way (Maestro's `launchApp`).
 */
class LaunchFlagsPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context,
  ): List<ReactActivityLifecycleListener> = listOf(
    object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        LaunchFlags.extras = activity.intent?.extras
      }
    },
  )
}

internal object LaunchFlags {
  @Volatile
  var extras: Bundle? = null
}
