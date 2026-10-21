// Asks before an AI feature sends entries to OpenAI, unless the user already allowed it on this device
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { aiPermissionQuestion } from '@/domain/ai-permission';
import { useSettings } from '@/state/settings-context';

// Resolves to true when the feature may send entries: already allowed, or allowed now in the question.
export function useAiPermission() {
  const { aiFeaturesAllowed, setAiFeaturesAllowed } = useSettings();

  return useCallback(() => {
    if (aiFeaturesAllowed) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        aiPermissionQuestion.title,
        aiPermissionQuestion.message,
        [
          { onPress: () => resolve(false), style: 'cancel', text: aiPermissionQuestion.notNow },
          {
            onPress: () => {
              setAiFeaturesAllowed(true);
              resolve(true);
            },
            text: aiPermissionQuestion.allow,
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }, [aiFeaturesAllowed, setAiFeaturesAllowed]);
}
