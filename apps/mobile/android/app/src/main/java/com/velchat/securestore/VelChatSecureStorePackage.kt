package com.velchat.securestore

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers {@link VelChatSecureStoreModule}. Added by hand in `MainApplication` for the same
 * reason the push package is: it lives inside the app, so there is nothing for autolinking to
 * find.
 */
class VelChatSecureStorePackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == VelChatSecureStoreModule.NAME) VelChatSecureStoreModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        VelChatSecureStoreModule.NAME to
            ReactModuleInfo(
                VelChatSecureStoreModule.NAME,
                VelChatSecureStoreModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                // Eager: `infra/kv/mmkv.ts` asks for the key at module scope, before any effect
                // runs, so the module has to be ready the moment javascript starts.
                /* needsEagerInit = */ true,
                /* isCxxModule = */ false,
                // Bridgeless routes legacy modules through the interop layer; claiming to be a
                // TurboModule without a codegen spec makes the lookup fail outright.
                /* isTurboModule = */ false,
            ))
  }
}
