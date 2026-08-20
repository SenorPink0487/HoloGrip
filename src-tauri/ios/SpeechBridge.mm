#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <Speech/Speech.h>

typedef void (*HoloGripSpeechCallback)(void *context, const char *text, const char *error);

@interface HoloGripSpeechBridge : NSObject
@property(nonatomic, strong) AVAudioEngine *audioEngine;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, copy) NSString *latestText;
@property(nonatomic, assign) HoloGripSpeechCallback callback;
@property(nonatomic, assign) void *callbackContext;
@property(nonatomic, assign) BOOL finished;
+ (instancetype)shared;
- (void)startWithCallback:(HoloGripSpeechCallback)callback context:(void *)context;
- (void)stop;
@end

@implementation HoloGripSpeechBridge

+ (instancetype)shared {
  static HoloGripSpeechBridge *bridge;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    bridge = [[HoloGripSpeechBridge alloc] init];
  });
  return bridge;
}

- (void)finishWithText:(NSString *)text error:(NSString *)error {
  if (self.finished) return;
  self.finished = YES;

  AVAudioInputNode *input = self.audioEngine.inputNode;
  if (self.audioEngine.isRunning) [self.audioEngine stop];
  @try {
    [input removeTapOnBus:0];
  } @catch (__unused NSException *exception) {
  }
  [self.request endAudio];
  [self.task cancel];
  [[AVAudioSession sharedInstance] setActive:NO
                                 withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                       error:nil];

  HoloGripSpeechCallback callback = self.callback;
  void *context = self.callbackContext;
  self.callback = NULL;
  self.callbackContext = NULL;
  self.task = nil;
  self.request = nil;
  self.audioEngine = nil;
  self.recognizer = nil;

  if (callback) {
    callback(context, text.length ? text.UTF8String : NULL, error.length ? error.UTF8String : NULL);
  }
}

- (void)beginRecording {
  self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"zh-CN"]];
  if (!self.recognizer || !self.recognizer.isAvailable) {
    [self finishWithText:nil error:@"speech-service-unavailable"];
    return;
  }

  AVAudioSession *session = AVAudioSession.sharedInstance;
  NSError *sessionError = nil;
  [session setCategory:AVAudioSessionCategoryRecord
                  mode:AVAudioSessionModeMeasurement
               options:AVAudioSessionCategoryOptionDuckOthers
                 error:&sessionError];
  if (!sessionError) [session setActive:YES error:&sessionError];
  if (sessionError) {
    [self finishWithText:nil error:@"microphone-session-failed"];
    return;
  }

  self.audioEngine = [[AVAudioEngine alloc] init];
  self.request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  self.request.shouldReportPartialResults = YES;
  self.request.taskHint = SFSpeechRecognitionTaskHintDictation;
  self.latestText = @"";

  __weak typeof(self) weakSelf = self;
  self.task = [self.recognizer recognitionTaskWithRequest:self.request
                                            resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      typeof(self) strongSelf = weakSelf;
      if (!strongSelf || strongSelf.finished) return;
      if (result) strongSelf.latestText = result.bestTranscription.formattedString ?: @"";
      if (result.isFinal) {
        [strongSelf finishWithText:strongSelf.latestText error:nil];
      } else if (error) {
        [strongSelf finishWithText:nil error:error.localizedDescription ?: @"speech-recognition-failed"];
      }
    });
  }];

  AVAudioInputNode *input = self.audioEngine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format.sampleRate <= 0 || format.channelCount == 0) {
    [self finishWithText:nil error:@"microphone-format-invalid"];
    return;
  }
  [input installTapOnBus:0
              bufferSize:1024
                  format:format
                   block:^(AVAudioPCMBuffer *buffer, __unused AVAudioTime *when) {
    [weakSelf.request appendAudioPCMBuffer:buffer];
  }];

  [self.audioEngine prepare];
  NSError *startError = nil;
  if (![self.audioEngine startAndReturnError:&startError]) {
    [self finishWithText:nil error:startError.localizedDescription ?: @"microphone-start-failed"];
  }
}

- (void)startWithCallback:(HoloGripSpeechCallback)callback context:(void *)context {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.finished && self.callback) {
      [self finishWithText:nil error:@"speech-recognition-replaced"];
    }
    self.finished = NO;
    self.callback = callback;
    self.callbackContext = context;

    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (self.finished) return;
        if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
          [self finishWithText:nil error:@"speech-permission-denied"];
          return;
        }
        [AVAudioSession.sharedInstance requestRecordPermission:^(BOOL granted) {
          dispatch_async(dispatch_get_main_queue(), ^{
            if (self.finished) return;
            if (!granted) {
              [self finishWithText:nil error:@"microphone-permission-denied"];
              return;
            }
            [self beginRecording];
          });
        }];
      });
    }];
  });
}

- (void)stop {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.finished || !self.callback) return;
    if (self.audioEngine.isRunning) [self.audioEngine stop];
    [self.request endAudio];
    [self.task finish];

    // Give Speech.framework a short window to deliver its final hypothesis.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (!self.finished) {
        if (self.latestText.length) {
          [self finishWithText:self.latestText error:nil];
        } else {
          [self finishWithText:nil error:@"speech-recognition-empty"];
        }
      }
    });
  });
}

@end

extern "C" void hologrip_speech_recognize(HoloGripSpeechCallback callback, void *context) {
  [[HoloGripSpeechBridge shared] startWithCallback:callback context:context];
}

extern "C" void hologrip_speech_request_permissions(HoloGripSpeechCallback callback, void *context) {
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
        callback(context, NULL, "speech-permission-denied");
        return;
      }
      void (^handleMicrophonePermission)(BOOL) = ^(BOOL granted) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (granted) {
            callback(context, "authorized", NULL);
          } else {
            callback(context, NULL, "microphone-permission-denied");
          }
        });
      };
      if (@available(iOS 17.0, *)) {
        [AVAudioApplication requestRecordPermissionWithCompletionHandler:handleMicrophonePermission];
      } else {
        [AVAudioSession.sharedInstance requestRecordPermission:handleMicrophonePermission];
      }
    });
  }];
}

extern "C" void hologrip_speech_stop(void) {
  [[HoloGripSpeechBridge shared] stop];
}
