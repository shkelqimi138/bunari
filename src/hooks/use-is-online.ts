// Hook reporting whether the device is online
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );

  return isOnline;
}
