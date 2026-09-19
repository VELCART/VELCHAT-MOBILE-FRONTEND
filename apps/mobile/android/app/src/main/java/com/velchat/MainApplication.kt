package com.velchat

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.velchat.push.VelChatPushPackage
import com.velchat.securestore.VelChatSecureStorePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Push lives inside the app rather than in a node module, so there is nothing for
          // autolinking to find — it is registered by hand (ADR 0008). The package creates its
          // module lazily, so this line costs nothing at startup.
          add(VelChatPushPackage())
          // The encrypted KV store asks this for its key at module scope, before any effect
          // runs, so it is registered eagerly (VC-016).
          add(VelChatSecureStorePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
