// Fallback route that redirects unknown addresses to the app start
import { Redirect } from 'expo-router';

// Any unknown bunari:// link (for example an auth error redirect such as
// `bunari://**?error=…`) opens the app normally instead of an "Unmatched Route"
// page. The auth provider shows the link's error message separately.
export default function NotFoundRoute() {
  return <Redirect href="/" />;
}
