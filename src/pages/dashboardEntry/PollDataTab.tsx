import { CountEntry } from './dashboardUtils';
import { RankingSection } from './dashboardCharts';

type PollData = {
  acquisitionSources: CountEntry[];
  loginCountries: CountEntry[];
};

export default function PollDataTab({ pollData }: { pollData: PollData }) {
  return (
    <>
      <RankingSection
        title="User Acquisition Sources 获客来源"
        subtitle="How many users mention each acquisition source (deduped per user)."
        note="Started collecting in May — data may not be available for all users."
        data={pollData.acquisitionSources}
        valueLabel="Users"
        pointLabel="user mentions"
      />
      <RankingSection
        title="Login Country 登录国家排名"
        subtitle="Country resolved from user_poll_data.login_ip.country (one country per user)."
        note="Started collecting in May — data may not be available for all users."
        data={pollData.loginCountries}
        valueLabel="Users"
        pointLabel="users"
      />
    </>
  );
}
