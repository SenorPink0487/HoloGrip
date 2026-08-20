//! iOS native speech-recognition bridge.
//!
//! WKWebView does not expose the Web Speech API used by desktop browsers, so
//! iPad builds delegate live microphone transcription to Speech.framework.

use crate::{CommandError, CmdResult};

#[cfg(target_os = "ios")]
mod ios {
    use std::ffi::{c_char, c_void, CStr};

    use tokio::sync::oneshot;

    type NativeSpeechCallback = extern "C" fn(*mut c_void, *const c_char, *const c_char);

    unsafe extern "C" {
        fn hologrip_speech_recognize(
            callback: NativeSpeechCallback,
            context: *mut c_void,
        );
        fn hologrip_speech_request_permissions(
            callback: NativeSpeechCallback,
            context: *mut c_void,
        );
        fn hologrip_speech_stop();
    }

    struct CallbackState {
        sender: Option<oneshot::Sender<Result<String, String>>>,
    }

    extern "C" fn recognition_finished(
        context: *mut c_void,
        text: *const c_char,
        error: *const c_char,
    ) {
        if context.is_null() {
            return;
        }

        // SpeechBridge.mm guarantees exactly one terminal callback per start.
        let mut state = unsafe { Box::from_raw(context.cast::<CallbackState>()) };
        let result = if !error.is_null() {
            Err(unsafe { CStr::from_ptr(error) }.to_string_lossy().into_owned())
        } else if text.is_null() {
            Err("speech-recognition-empty".to_string())
        } else {
            Ok(unsafe { CStr::from_ptr(text) }.to_string_lossy().into_owned())
        };
        if let Some(sender) = state.sender.take() {
            let _ = sender.send(result);
        }
    }

    pub async fn recognize() -> Result<String, String> {
        invoke_native(hologrip_speech_recognize).await
    }

    pub async fn request_permissions() -> Result<String, String> {
        invoke_native(hologrip_speech_request_permissions).await
    }

    async fn invoke_native(
        native_fn: unsafe extern "C" fn(NativeSpeechCallback, *mut c_void),
    ) -> Result<String, String> {
        let (sender, receiver) = oneshot::channel();
        let context = Box::into_raw(Box::new(CallbackState {
            sender: Some(sender),
        }));
        unsafe {
            native_fn(recognition_finished, context.cast::<c_void>());
        }
        receiver
            .await
            .map_err(|_| "speech-recognition-cancelled".to_string())?
    }

    pub fn stop() {
        unsafe { hologrip_speech_stop() }
    }
}

#[tauri::command]
pub async fn request_speech_permissions_native() -> CmdResult<()> {
    #[cfg(target_os = "ios")]
    {
        ios::request_permissions()
            .await
            .map(|_| ())
            .map_err(CommandError::Msg)
    }

    #[cfg(not(target_os = "ios"))]
    Err(CommandError::Msg(
        "native-speech-unsupported-platform".to_string(),
    ))
}

#[tauri::command]
pub async fn recognize_speech_native() -> CmdResult<String> {
    #[cfg(target_os = "ios")]
    {
        return ios::recognize().await.map_err(CommandError::Msg);
    }

    #[cfg(not(target_os = "ios"))]
    Err(CommandError::Msg(
        "native-speech-unsupported-platform".to_string(),
    ))
}

#[tauri::command]
pub fn stop_speech_native() -> CmdResult<()> {
    #[cfg(target_os = "ios")]
    {
        ios::stop();
        return Ok(());
    }

    #[cfg(not(target_os = "ios"))]
    Err(CommandError::Msg(
        "native-speech-unsupported-platform".to_string(),
    ))
}
