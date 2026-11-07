import { useSearchParams } from 'react-router';
import { today } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import { CashRegister } from './CashRegister';

/** The day's money in and out, laid out like the paper register: the first thing to check each evening. */
export default function RegisterPage() {
  const [params, setParams] = useSearchParams();
  const day = params.get('day') || today();

  return (
    <>
      <PageHeader
        title="Daily register"
        description="Everything received and paid on one day, by person, in cash and bank columns, like your paper register. Check it each evening."
      />
      <CashRegister day={day} onDay={(d) => setParams(d === today() ? {} : { day: d }, { replace: true })} />
    </>
  );
}
