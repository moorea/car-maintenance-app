package expo.modules.launchflags

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Whether the app was launched with a flag, as UI tests do: `isSet("demoSignedOut")`. */
class LaunchFlagsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LaunchFlags")

    Function("isSet") { name: String ->
      val extras = LaunchFlags.extras ?: appContext.currentActivity?.intent?.extras
      // Written as `-name` in a flow so iOS reads it too; checked with and without the dash.
      listOf(name, "-$name", "--$name").any { key ->
        @Suppress("DEPRECATION")
        when (val value = extras?.get(key)) {
          is Boolean -> value
          is Number -> value.toInt() == 1
          is String -> value == "true" || value == "1"
          else -> false
        }
      }
    }
  }
}
