import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, Form, Question } from '../../utils/api';
import { getScaleLabel, isIconScaleType } from '../../utils/iconScale';
import {
  Activity,
  BatteryLow,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Leaf,
  Loader2,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-react';

function hasAnswer(question: Question, answer: unknown) {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  if (typeof answer === 'string') {
    return answer.trim().length > 0;
  }

  if (question.type === 'number') {
    return answer !== '' && answer !== undefined && answer !== null;
  }

  return answer !== undefined && answer !== null;
}

function getPlaceholder(question: Question) {
  if (question.placeholder) {
    return question.placeholder;
  }

  switch (question.type) {
    case 'number':
      return 'กรอกเป็นตัวเลข';
    case 'textarea':
      return 'พิมพ์คำตอบของคุณ';
    default:
      return 'กรอกข้อมูลของคุณ';
  }
}

const scaleVisuals = [
  { Icon: BatteryLow, accent: 'text-rose-500', surface: 'bg-rose-50 border-rose-100' },
  { Icon: Gauge, accent: 'text-amber-500', surface: 'bg-amber-50 border-amber-100' },
  { Icon: Activity, accent: 'text-sky-500', surface: 'bg-sky-50 border-sky-100' },
  { Icon: Leaf, accent: 'text-emerald-500', surface: 'bg-emerald-50 border-emerald-100' },
  { Icon: Zap, accent: 'text-violet-500', surface: 'bg-violet-50 border-violet-100' },
];

export function FormFillPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [respondentName, setRespondentName] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    loadForm();
  }, [formId]);

  const loadForm = async () => {
    if (!formId) return;

    try {
      const result = await api.getForm(formId);
      setForm(result.form);
    } catch (error) {
      console.error('Error loading form:', error);
      alert('ไม่พบแบบฟอร์มนี้');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers({ ...answers, [questionId]: value });
  };

  const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
    const currentAnswers = answers[questionId] || [];
    if (checked) {
      handleAnswerChange(questionId, [...currentAnswers, option]);
    } else {
      handleAnswerChange(questionId, currentAnswers.filter((a: string) => a !== option));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId || !form) return;

    if (!respondentName.trim()) {
      alert('กรุณากรอกชื่อ-นามสกุล');
      return;
    }

    const unanswered = form.questions.filter((question) => question.required !== false && !hasAnswer(question, answers[question.id]));
    if (unanswered.length > 0) {
      alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบทุกข้อ');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitResponse(formId, answers, respondentName || 'ไม่ระบุชื่อ');
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('เกิดข้อผิดพลาดในการส่งคำตอบ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1d7757] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-[#1d7757] px-4 flex items-center justify-center">
        <div className="bg-white rounded-[28px] shadow-xl p-8 text-center max-w-md w-full">
          <p className="text-[#245c48] font-medium">ไม่พบแบบฟอร์มนี้</p>
        </div>
      </div>
    );
  }

  const inputClassName = 'w-full rounded-[18px] border border-[#d5f0df] bg-white px-4 py-4 text-[15px] text-[#234738] shadow-[inset_0_1px_2px_rgba(21,89,60,0.05)] outline-none transition focus:border-[#43a178] focus:ring-4 focus:ring-[#dff3e7] disabled:cursor-not-allowed disabled:bg-[#f5fbf7]';

  const renderQuestionField = (question: Question) => {
    const answer = answers[question.id];
    const isDisabled = submitted || submitting;

    if (question.type === 'text') {
      return (
        <input
          type="text"
          value={answer || ''}
          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
          className={inputClassName}
          placeholder={getPlaceholder(question)}
          disabled={isDisabled}
          required={question.required !== false}
        />
      );
    }

    if (question.type === 'number') {
      return (
        <input
          type="number"
          min="0"
          value={answer || ''}
          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
          className={inputClassName}
          placeholder={getPlaceholder(question)}
          disabled={isDisabled}
          required={question.required !== false}
        />
      );
    }

    if (question.type === 'textarea') {
      return (
        <textarea
          value={answer || ''}
          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
          className={`${inputClassName} min-h-32 resize-none`}
          placeholder={getPlaceholder(question)}
          disabled={isDisabled}
          required={question.required !== false}
        />
      );
    }

    if (question.type === 'select' && question.options) {
      return (
        <select
          value={answer || ''}
          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
          className={inputClassName}
          disabled={isDisabled}
          required={question.required !== false}
        >
          <option value="">{getPlaceholder(question)}</option>
          {question.options.map((option, optionIndex) => (
            <option key={optionIndex} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    if (isIconScaleType(question.type) && question.options) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {question.options.map((option, optionIndex) => {
            const selected = answer === option;
            const visual = scaleVisuals[optionIndex] || scaleVisuals[scaleVisuals.length - 1];
            const Icon = visual.Icon;

            return (
              <button
                key={optionIndex}
                type="button"
                onClick={() => handleAnswerChange(question.id, option)}
                disabled={isDisabled}
                className={`rounded-[22px] border px-4 py-4 text-left transition-all ${selected ? 'border-[#2563eb] bg-[#eff6ff] shadow-[0_10px_28px_rgba(37,99,235,0.14)]' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300'} disabled:opacity-60`}
                aria-label={getScaleLabel(option, optionIndex)}
              >
                <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border ${selected ? 'bg-white border-[#bfdbfe]' : visual.surface}`}>
                  <Icon className={`h-6 w-6 ${selected ? 'text-[#2563eb]' : visual.accent}`} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{getScaleLabel(option, optionIndex)}</p>
                <p className="mt-1 text-xs text-slate-500">เลือกระดับที่ตรงกับความรู้สึกของคุณหลังออกกำลังกาย</p>
              </button>
            );
          })}
        </div>
      );
    }

    if (question.type === 'radio' && question.options) {
      return (
        <div className="space-y-3">
          {question.options.map((option, optionIndex) => {
            const selected = answer === option;

            return (
              <label
                key={optionIndex}
                className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition ${selected ? 'border-[#43a178] bg-[#eef8f2]' : 'border-[#d7ebe0] bg-white'} ${isDisabled ? 'cursor-not-allowed opacity-80' : 'hover:border-[#7bb899]'}`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={answer === option}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="h-4 w-4 text-[#1d7757] focus:ring-[#43a178]"
                  disabled={isDisabled}
                  required={question.required !== false}
                />
                <span className="text-[#234738]">{option}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (question.type === 'checkbox' && question.options) {
      return (
        <div className="space-y-3">
          {question.options.map((option, optionIndex) => {
            const selected = (answer || []).includes(option);

            return (
              <label
                key={optionIndex}
                className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition ${selected ? 'border-[#43a178] bg-[#eef8f2]' : 'border-[#d7ebe0] bg-white'} ${isDisabled ? 'cursor-not-allowed opacity-80' : 'hover:border-[#7bb899]'}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => handleCheckboxChange(question.id, option, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1d7757] focus:ring-[#43a178]"
                  disabled={isDisabled}
                />
                <span className="text-[#234738]">{option}</span>
              </label>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#eff6ff] bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.14),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(22,163,74,0.12),_transparent_22%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 rounded-[32px] bg-gradient-to-br from-[#0f766e] via-[#15803d] to-[#16a34a] px-6 py-8 text-white shadow-[0_24px_70px_rgba(21,128,61,0.24)] sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-emerald-50 backdrop-blur">
            <ClipboardCheck className="h-4 w-4" />
            Public Form
          </div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{form.title}</h1>
              <p className="mt-3 max-w-2xl text-sm text-emerald-50 sm:text-base">กรุณากรอกข้อมูลการออกกำลังกายของคุณในวันนี้ หน้านี้ใช้สำหรับส่งคำตอบเท่านั้น ไม่มีการแสดงผลสรุปสาธารณะ</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#15803d] shadow-[0_10px_30px_rgba(8,64,43,0.18)]">
              <Activity className="h-8 w-8" />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-emerald-50">
              <div className="flex items-center gap-2 font-medium text-white">
                <ShieldCheck className="h-4 w-4" />
                ข้อมูลสำหรับผู้ดูแล
              </div>
              <p className="mt-1 text-emerald-100">ผลสรุปจะถูกดูได้จากหน้าแอดมินเท่านั้น ไม่เปิดผ่านลิงก์นี้</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-emerald-50">
              <div className="flex items-center gap-2 font-medium text-white">
                <Lock className="h-4 w-4" />
                ใช้เวลาไม่นาน
              </div>
              <p className="mt-1 text-emerald-100">กรอกครบในหน้าเดียวแล้วกดส่งได้ทันที</p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] bg-white px-6 py-7 shadow-[0_20px_80px_rgba(37,99,235,0.14)] sm:px-8 sm:py-9">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="mb-2 block text-[15px] font-semibold text-[#245c48]">
                ชื่อ-นามสกุล
              </label>
              <input
                type="text"
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                className={inputClassName}
                placeholder="กรอกชื่อของคุณ"
                disabled={submitted || submitting}
                required
              />
            </div>

            {form.questions.map((question) => (
              <div key={question.id} className="mb-6">
                {question.imageUrl && (
                  <div className="mb-3 overflow-hidden rounded-[24px] border border-[#d7ebe0] bg-white shadow-sm">
                    <img
                      src={question.imageUrl}
                      alt={question.imageName || question.text || 'ภาพประกอบคำถาม'}
                      className="max-h-[360px] w-full object-cover"
                    />
                  </div>
                )}

                <label className="mb-2 block text-[15px] font-semibold text-[#245c48]">
                  {question.text}
                  {question.required !== false && <span className="ml-1 text-[#43a178]">*</span>}
                </label>

                {renderQuestionField(question)}
              </div>
            ))}

            <button
              type="submit"
              disabled={submitting || submitted}
              className="mt-2 w-full rounded-[20px] bg-slate-950 px-6 py-4 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'กำลังส่งแบบสอบถาม...' : submitted ? 'ส่งแบบสอบถามแล้ว' : 'ส่งแบบสอบถาม'}
            </button>

            {submitted && (
              <div className="mt-5 flex items-center justify-center gap-3 rounded-[20px] bg-[#eef8f2] px-5 py-4 text-center text-[#1d7757]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="font-medium">ส่งแบบสอบถามเรียบร้อยแล้ว ขอบคุณครับ/ค่ะ! 🎉</p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
