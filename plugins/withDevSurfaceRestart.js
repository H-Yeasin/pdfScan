// Debug builds only: a reload after a fatal JS error showed an empty window.
//
// React Native 0.86's bridgeless ReactHost answers a fatal JS error (a RedBox, e.g. an error while
// the bundle loads) by destroying itself: ReactHostImpl.handleHostException → destroy, whose
// task stops this activity's surface and clears the host's `attachedSurfaces`. A later reload
// (Metro's `r`, the RedBox's Reload, the dev menu) builds a new React instance and restarts the
// surfaces on that list: none, so nothing renders until the activity is recreated.
// expo-dev-launcher only takes over Java errors, not JS ones. Found 2026-10-23 on the emulator:
// 20/20 reloads after a startup error stayed blank; plain reloads 0/20.
//
// This adds to MainActivity, in debug builds: when a React instance is up, if this activity's
// surface is no longer on the host's list, start it again (ReactDelegate.loadApp(), which starts
// the same surface). That list, not `isRunning`, is the test: a normal reload never takes the
// surface off it, while its restart races the instance listeners. Neither field has a public
// getter in 0.86, so both are read by reflection; if a later version renames them, this does
// nothing, as before.
//
// Reviewed like any config file (AGENTS.md, Security): it only adds the Kotlin below to
// MainActivity.
const { withMainActivity } = require('expo/config-plugins');

const BEGIN = '// @generated begin pdfscan-dev-surface-restart (plugins/withDevSurfaceRestart.js)';
const END = '// @generated end pdfscan-dev-surface-restart';

const IMPORTS = `import com.facebook.react.ReactDelegate
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext`;

const REGISTER = `    ${BEGIN}
    if (BuildConfig.DEBUG) reactHost?.addReactInstanceEventListener(devSurfaceRestart)
    ${END}`;

const MEMBERS = `  ${BEGIN}
  // Debug builds only: a fatal JS error destroys the ReactHost, which then forgets this
  // activity's surface, so a reload rendered nothing. Start it again once the next instance is up.
  private val devSurfaceRestart =
      object : ReactInstanceEventListener {
        override fun onReactContextInitialized(context: ReactContext) {
          val delegate = reactDelegate ?: return
          val host = reactHost ?: return
          try {
            val surface =
                ReactDelegate::class.java.getDeclaredField("reactSurface").apply { isAccessible = true }.get(delegate)
                    ?: return
            val attached =
                host.javaClass.getDeclaredField("attachedSurfaces").apply { isAccessible = true }.get(host) as MutableSet<*>
            if (synchronized(attached) { attached.contains(surface) }) return
          } catch (e: Exception) {
            return
          }
          delegate.loadApp()
        }
      }

  override fun onDestroy() {
    if (BuildConfig.DEBUG) reactHost?.removeReactInstanceEventListener(devSurfaceRestart)
    super.onDestroy()
  }
  ${END}`;

function insertOnce(src, anchor, text, label) {
  if (!src.includes(anchor)) {
    throw new Error(`withDevSurfaceRestart: MainActivity has no "${anchor}" to put the ${label} after`);
  }
  return src.replace(anchor, `${anchor}\n${text}`);
}

const withDevSurfaceRestart = (config) =>
  withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    if (config.modResults.language !== 'kt') {
      throw new Error('withDevSurfaceRestart: expects a Kotlin MainActivity');
    }
    if (src.includes(BEGIN)) return config;
    src = insertOnce(src, 'import com.facebook.react.ReactActivityDelegate', IMPORTS, 'imports');
    src = insertOnce(src, '    super.onCreate(null)', REGISTER, 'listener');
    // The members go after onCreate, whose body now ends with the listener block.
    src = insertOnce(src, `${REGISTER}\n  }`, `\n${MEMBERS}`, 'members');
    config.modResults.contents = src;
    return config;
  });

module.exports = withDevSurfaceRestart;
