import { useState } from 'react';
import { LuCheck, LuChevronRight, LuExternalLink, LuGraduationCap, LuX, LuTrophy, LuFlower2, LuShieldCheck } from 'react-icons/lu';
import { LESSONS, getLesson, type Question } from '../content/lessons';
import { updateProgress, useProgress } from '../progress';
import { Empty, ListLink, Topbar } from '../ui';

/** Multiple-choice quiz with instant feedback; reports the score when finished. */
export function Quiz({ questions, onDone }: { questions: Question[]; onDone: (score: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = questions[i];
  if (finished) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="big-num">{score}/{questions.length}</div>
        <p style={{ margin: '6px 0 12px' }}>{score === questions.length ? 'Perfect. Well done!' : 'Done. Review the points above and try again any time.'}</p>
        <button className="btn secondary" onClick={() => { setI(0); setPicked(null); setScore(0); setFinished(false); }}>Try again</button>
      </div>
    );
  }
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    if (k === q.answer) setScore((s) => s + 1);
    navigator.vibrate?.(k === q.answer ? 15 : [10, 40, 10]);
  };
  const next = () => {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setPicked(null);
    } else {
      setFinished(true);
      onDone(score);
    }
  };
  return (
    <div className="card stack">
      <div className="eyebrow">Question {i + 1} of {questions.length}</div>
      <b style={{ fontSize: 18 }}>{q.q}</b>
      <div className="stack" style={{ gap: 8 }}>
        {q.options.map((o, k) => {
          const state = picked === null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : 'dim';
          return (
            <button key={k} className={`quiz-opt ${state}`} onClick={() => choose(k)} aria-pressed={picked === k}>
              {state === 'right' && <LuCheck />}{state === 'wrong' && <LuX />}<span>{o}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <div className={`banner ${picked === q.answer ? 'good' : 'warn'}`}><div><b>{picked === q.answer ? 'Correct.' : 'Not quite.'}</b><p>{q.why}</p></div></div>
          <button className="btn" onClick={next}>{i + 1 < questions.length ? 'Next question' : 'See score'}</button>
        </>
      )}
    </div>
  );
}

export function Academy() {
  const p = useProgress();
  const done = LESSONS.filter((l) => p.lessons[l.id]?.done).length;
  const nextLesson = LESSONS.find((l) => !p.lessons[l.id]?.done);
  return (
    <>
      <Topbar title="Learn" right={<a className="icon-btn" href="#/play" aria-label="Ranks and games"><LuTrophy /></a>} />
      <div className="card row">
        <LuGraduationCap style={{ width: 36, height: 36, color: 'var(--primary-strong)' }} />
        <div className="grow">
          <b>Honeyguide Academy</b>
          <div className="small muted">From "should I?" to a registered, working hive in twelve short lessons.</div>
          <div className="xp-bar" style={{ marginTop: 8 }}><span style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
          <div className="small muted" style={{ marginTop: 4 }}>{done} of {LESSONS.length} done</div>
        </div>
      </div>
      {nextLesson && <a className="btn" href={`#/learn/${nextLesson.id}`} style={{ marginTop: 12 }}>{done ? 'Continue' : 'Start'}: {nextLesson.title} <LuChevronRight /></a>}

      <h3 className="h2">Lessons</h3>
      <div className="list">
        {LESSONS.map((l) => (
          <ListLink key={l.id} href={`/learn/${l.id}`}
            left={<span className={`lesson-num ${p.lessons[l.id]?.done ? 'done' : ''}`}>{p.lessons[l.id]?.done ? <LuCheck /> : l.n}</span>}
            title={l.title} sub={`${l.minutes} min${p.lessons[l.id] ? ` · quiz ${p.lessons[l.id].best}/${l.quiz.length}` : ''}`} />
        ))}
      </div>

      <h3 className="h2">Practise</h3>
      <div className="list">
        <ListLink href="/play/flowers" left={<LuFlower2 />} title="Flower Match" sub="Learn the forage calendar" />
        <ListLink href="/play/doctor" left={<LuShieldCheck />} title="Hive Doctor" sub="Pest and disease decisions, safely" />
        <ListLink href="/play/waggle" left={<LuTrophy />} title="Waggle Dance Lab" sub="How bees share where the flowers are" />
      </div>
      <p className="small muted">Lessons are general guidance written for Honeyguide and await review by an experienced South African beekeeper. Learn with a local club and mentor too.</p>
    </>
  );
}

export function LessonView({ id }: { id: string }) {
  const lesson = getLesson(id);
  const p = useProgress();
  if (!lesson) return (<><Topbar title="Lesson" backTo="/learn" /><Empty title="Lesson not found" text="It may have moved." /></>);
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  const record = p.lessons[lesson.id];
  const finish = (score: number) =>
    updateProgress((prev) => ({
      ...prev,
      lessons: { ...prev.lessons, [lesson.id]: { done: true, best: Math.max(score, prev.lessons[lesson.id]?.best ?? 0), at: new Date().toISOString() } },
    }));
  return (
    <>
      <Topbar title={`Lesson ${lesson.n}`} backTo="/learn" />
      <h1 className="step-title" style={{ marginTop: 0 }}>{lesson.title}</h1>
      <p className="muted" style={{ marginTop: 4 }}>{lesson.minutes} min read{record?.done ? ' · completed' : ''}</p>
      <p style={{ fontSize: 17 }}>{lesson.intro}</p>
      <ul className="lesson-points">
        {lesson.points.map((pt) => <li key={pt}>{pt}</li>)}
      </ul>
      {lesson.task && <a className="btn secondary" href={`#${lesson.task.href}`}>Try it: {lesson.task.label} <LuChevronRight /></a>}
      <h3 className="h2">Quick quiz</h3>
      <Quiz key={lesson.id} questions={lesson.quiz} onDone={finish} />
      {record?.done && next && <a className="btn" href={`#/learn/${next.id}`} style={{ marginTop: 14 }}>Next: {next.title} <LuChevronRight /></a>}
      {lesson.sources && (
        <>
          <h3 className="h2">Sources</h3>
          <div className="stack small">
            {lesson.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}><LuExternalLink /> {s.label}</a>)}
          </div>
        </>
      )}
      <p className="small muted" style={{ marginTop: 16 }}>Awaiting expert review.</p>
    </>
  );
}
