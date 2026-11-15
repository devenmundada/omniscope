import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfileForUser } from '@/lib/db/profile';
import { PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { ProfileEditor } from '@/components/profile/profile-editor';

export const metadata = {
  title: 'Personal Financial Profile — OmniScope',
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/profile');
  }

  const profile = await getProfileForUser(user.id);
  if (!profile) {
    throw new Error('Failed to load profile for verified identity.');
  }

  return (
    <StaggerContainer>
      <StaggerItem>
        <PageHeader
          eyebrow="Settings"
          title="Personal Financial Profile"
          question="Who are you, and what are the boundaries of your financial world?"
        />
      </StaggerItem>

      <StaggerItem>
        <ProfileEditor initialData={profile} />
      </StaggerItem>
    </StaggerContainer>
  );
}
