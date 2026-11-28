import { useSearchParams } from 'react-router';
import { today } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import { CashRegister } from './CashRegister';
import { DailyDesk } from './DailyDesk';

/**
 * The accountant's day on one screen: what is waiting (cash from technicians, staff claims), the day's money in
 * and out like the paper register, the buttons to record anything, and counting the cash to close the day.
 */
export default function RegisterPage() {
  const [params, setParams] = useSearchParams();
  const day = params.get('day') || today();

  return (
    <>
      <PageHeader
        title="Daily register"
        description="Take cash from technicians, approve staff claims, record money received and paid, and close the day, all from here."
      />
      <DailyDesk />
      <CashRegister day={day} onDay={(d) => setParams(d === today() ? {} : { day: d }, { replace: true })} />
    </>
  );
}
