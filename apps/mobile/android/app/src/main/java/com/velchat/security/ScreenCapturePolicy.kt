package com.velchat.security

import android.app.Activity
import android.view.WindowManager

/**
 * Whether this build blocks screenshots and screen recording (VC-019, §A1).
 *
 * `FLAG_SECURE` is a single window-level flag with three effects, and only the first is the one
 * people ask for: screenshots and screen recording fail, the window is black in the recents
 * thumbnail, and the window cannot be mirrored to an external display or a screen-share.
 *
 * ** IT IS OFF, AND TURNING IT ON IS A PRODUCT DECISION, NOT A SECURITY CLEANUP. **
 *
 * Three reasons it is not simply switched on here:
 *
 * 1. It is not what the category leader does. WhatsApp does not set FLAG_SECURE globally — it
 *    is applied to a handful of screens (view-once media, the in-app browser) and nowhere else.
 *    Users screenshot conversations constantly and expect to be able to.
 * 2. It is enforced against the wrong adversary. FLAG_SECURE stops the DEVICE's own screenshot
 *    path; it does nothing about the camera pointed at the screen, which is how a conversation
 *    actually leaks. The threat it does mitigate — a malicious screen-recorder — is already
 *    largely handled by the MediaProjection consent prompt.
 * 3. It breaks this project's QA loop. Screenshot-driven testing on the two devices this repo
 *    is exercised on is how defects get filed, and a black recents thumbnail plus failing
 *    screenshots would make that loop impossible on the very builds that need it most.
 *
 * The mechanism is here, wired and one line from being live, so that the decision can be taken
 * on its merits rather than on how much work it is:
 *
 *   - Flip [BLOCK_SCREEN_CAPTURE] to `true` for an app-wide block, or
 *   - better, and what §A1 actually asks for: apply it per screen (phone entry, OTP, recovery
 *     phrase, view-once media) and leave chat alone. That needs a small React Native module so
 *     JS can raise and lower the flag as those screens mount — and registering a module means
 *     editing `MainApplication`, which is outside the change that introduced this file.
 */
object ScreenCapturePolicy {

    /**
     * The whole switch. Not a `const val`, so that flipping it does not depend on constant
     * folding behaving the same way in every build variant.
     */
    @JvmField
    val BLOCK_SCREEN_CAPTURE: Boolean = false

    /**
     * Apply the policy to an activity's window.
     *
     * The `false` branch CLEARS the flag rather than doing nothing, so this call is
     * authoritative: whatever a library or a previous configuration left on the window, the
     * window afterwards reflects what this file says. A half-applied FLAG_SECURE — set on some
     * launches and not others — is the worst of both worlds, because it looks like protection
     * while leaving the screens that matter uncovered.
     */
    @JvmStatic
    fun apply(activity: Activity) {
        if (BLOCK_SCREEN_CAPTURE) {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
