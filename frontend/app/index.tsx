import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';

export default function Index() {
  const { signedIn } = useAuth();
  return <Redirect href={signedIn ? '/(tabs)' : '/auth'} />;
}
