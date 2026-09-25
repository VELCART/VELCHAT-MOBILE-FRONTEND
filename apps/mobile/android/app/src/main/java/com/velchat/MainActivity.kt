package com.velchat

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.velchat.security.ScreenCapturePolicy

class MainActivity : ReactActivity() {

  /**
   * Screen-capture policy is applied here rather than lazily (VC-019, §A1).
   *
   * FLAG_SECURE governs the recents thumbnail as well as screenshots, and the system snapshots
   * a window the moment it is first drawn — so a flag raised any later than `onCreate` leaves a
   * readable thumbnail behind from the launch that set it. It is currently a no-op by design:
   * see [ScreenCapturePolicy] for why blocking screenshots app-wide is the owner's call and not
   * a default.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ScreenCapturePolicy.apply(this)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "VelChat"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
