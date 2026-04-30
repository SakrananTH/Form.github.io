import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Download,
  Loader2,
  Medal,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { api, Form, FormResponse, Question } from '../../utils/api';
import { hasResultsAccess } from '../../utils/adminAccess';
import { createAppUrl } from '../../utils/appUrl';
import { getScaleLabel, isIconScaleType } from '../../utils/iconScale';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

const TARGET_RATE = 85;
const PIE_COLORS = ['#2563eb', '#0ea5e9', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa'];

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

function getAnswerDisplay(answer: unknown) {
  if (Array.isArray(answer)) {
    return answer.length > 0 ? answer.join(', ') : 'ไม่ได้ระบุ';
  }

  if (answer === undefined || answer === null || String(answer).trim() === '') {
    return 'ไม่ได้ระบุ';
  }

  return String(answer);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatQuestionLabel(text: string) {
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

function formatQuestionType(type: Question['type']) {
  switch (type) {
    case 'text':
      return 'ข้อความสั้น';
    case 'textarea':
      return 'ข้อความยาว';
    case 'number':
      return 'ตัวเลข';
    case 'select':
      return 'ดรอปดาวน์';
    case 'radio':
      return 'เลือกได้ 1 ค่า';
    case 'checkbox':
      return 'เลือกได้หลายค่า';
    case 'icon-scale':
    case 'emoji-scale':
      return 'ระดับความรู้สึก';
    default:
      return type;
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResultsPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [formId]);

  const loadData = async () => {
    if (!formId) {
      setLoading(false);
      return;
    }

    if (!hasResultsAccess(formId)) {
      setIsAuthorized(false);
      setLoading(false);
      return;
    }

    try {
      const [formResult, responsesResult] = await Promise.all([
        api.getForm(formId),
        api.getResponses(formId),
      ]);
      setForm(formResult.form);
      setResponses(responsesResult.responses);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!formId) {
      return;
    }

    navigator.clipboard.writeText(createAppUrl(`/form/${formId}`));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCsv = () => {
    if (!form || !responses.length) {
      return;
    }

    const csvHeaders = ['ผู้ตอบ', 'ส่งเมื่อ', ...form.questions.map((question) => question.text)];
    const csvRows = responses.map((response) => [
      response.respondentName,
      formatDate(response.submittedAt),
      ...form.questions.map((question) => getAnswerDisplay(response.answers[question.id])),
    ]);

    const csv = [csvHeaders, ...csvRows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `results-${formId || form.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const dashboard = useMemo(() => {
    if (!form) {
      return null;
    }

    const totalResponses = responses.length;

    const questionMetrics = form.questions.map((question) => {
      const answeredCount = responses.filter((response) => hasAnswer(question, response.answers[question.id])).length;
      const responseRate = totalResponses > 0 ? (answeredCount / totalResponses) * 100 : 0;

      return {
        id: question.id,
        text: question.text,
        shortLabel: formatQuestionLabel(question.text),
        answeredCount,
        responseRate,
      };
    });

    const overallCompletion = questionMetrics.length > 0
      ? questionMetrics.reduce((sum, metric) => sum + metric.responseRate, 0) / questionMetrics.length
      : 0;

    const sortedByRate = [...questionMetrics].sort((left, right) => right.responseRate - left.responseRate);
    const strongestQuestion = sortedByRate[0] || null;
    const weakestQuestion = sortedByRate[sortedByRate.length - 1] || null;

    const categoryQuestion = form.questions.find((question) => /แผนก|department/i.test(question.text))
      || form.questions.find((question) => question.type === 'select' || question.type === 'radio' || question.type === 'text')
      || null;

    const categoryCounts = new Map<string, number>();

    if (categoryQuestion) {
      responses.forEach((response) => {
        const rawAnswer = response.answers[categoryQuestion.id];

        if (Array.isArray(rawAnswer)) {
          rawAnswer.forEach((value) => {
            const label = String(value || 'ไม่ได้ระบุ').trim() || 'ไม่ได้ระบุ';
            categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
          });
          return;
        }

        const label = String(rawAnswer || 'ไม่ได้ระบุ').trim() || 'ไม่ได้ระบุ';
        categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
      });
    }

    const sortedCategoryData = [...categoryCounts.entries()]
      .map(([label, count], index) => ({
        label,
        count,
        fill: PIE_COLORS[index % PIE_COLORS.length],
      }))
      .sort((left, right) => right.count - left.count);

    const categoryData = sortedCategoryData.length > 6
      ? [
          ...sortedCategoryData.slice(0, 5),
          {
            label: 'อื่น ๆ',
            count: sortedCategoryData.slice(5).reduce((sum, item) => sum + item.count, 0),
            fill: PIE_COLORS[5],
          },
        ]
      : sortedCategoryData;

    const numericQuestion = form.questions.find((question) => question.type === 'number' || /นาที|เวลา|duration|min/i.test(question.text)) || null;
    const numericValues = numericQuestion
      ? responses
          .map((response) => Number(response.answers[numericQuestion.id]))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];
    const averageNumeric = numericValues.length > 0
      ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
      : null;

    const sentimentQuestion = form.questions.find((question) => isIconScaleType(question.type)) || null;
    const sentimentOptions = sentimentQuestion?.options || [];
    const sentimentAnswers = sentimentQuestion
      ? responses
          .map((response) => response.answers[sentimentQuestion.id])
          .filter((answer) => typeof answer === 'string' && sentimentOptions.includes(answer)) as string[]
      : [];
    const emojiScore = sentimentQuestion && sentimentAnswers.length > 0 && sentimentOptions.length > 0
      ? (sentimentAnswers.reduce((sum, answer) => sum + (sentimentOptions.indexOf(answer) + 1), 0) / (sentimentAnswers.length * sentimentOptions.length)) * 100
      : null;

    const questionChartData = questionMetrics.map((metric) => ({
      question: metric.shortLabel,
      fullQuestion: metric.text,
      rate: Number(metric.responseRate.toFixed(2)),
      answeredCount: metric.answeredCount,
    }));

    const questionSummaryMap = new Map(questionMetrics.map((metric) => [metric.id, metric]));

    const questionSummaries = form.questions.map((question) => {
      const metric = questionSummaryMap.get(question.id);
      const answeredResponses = responses.filter((response) => hasAnswer(question, response.answers[question.id]));
      const answeredValues = answeredResponses.map((response) => response.answers[question.id]);

      const baseSummary = {
        id: question.id,
        text: question.text,
        shortLabel: metric?.shortLabel || formatQuestionLabel(question.text),
        type: question.type,
        required: question.required !== false,
        answeredCount: metric?.answeredCount || 0,
        responseRate: metric?.responseRate || 0,
        recentEntries: [...answeredResponses]
          .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
          .slice(0, 3)
          .map((response) => ({
            respondentName: response.respondentName,
            submittedAt: formatDate(response.submittedAt),
            answer: getAnswerDisplay(response.answers[question.id]),
          })),
        optionStats: undefined as Array<{ label: string; count: number; percent: number }> | undefined,
        numericStats: undefined as { average: number; min: number; max: number } | undefined,
        textStats: undefined as {
          uniqueAnswers: number;
          topAnswers: Array<{ label: string; count: number }>;
          latestAnswers: string[];
        } | undefined,
      };

      if (question.type === 'number') {
        const numericAnswers = answeredValues
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));

        return {
          ...baseSummary,
          numericStats: numericAnswers.length > 0
            ? {
                average: numericAnswers.reduce((sum, value) => sum + value, 0) / numericAnswers.length,
                min: Math.min(...numericAnswers),
                max: Math.max(...numericAnswers),
              }
            : undefined,
        };
      }

      if (question.type === 'radio' || question.type === 'select' || isIconScaleType(question.type)) {
        const optionSource = question.options || [];
        return {
          ...baseSummary,
          optionStats: optionSource.map((option, index) => {
            const count = answeredValues.filter((value) => value === option).length;
            return {
              label: isIconScaleType(question.type) ? getScaleLabel(option, index) : option,
              count,
              percent: answeredValues.length > 0 ? (count / answeredValues.length) * 100 : 0,
            };
          }),
        };
      }

      if (question.type === 'checkbox') {
        const flattenedSelections = answeredValues.flatMap((value) => Array.isArray(value) ? value : []);
        return {
          ...baseSummary,
          optionStats: (question.options || []).map((option) => {
            const count = flattenedSelections.filter((value) => value === option).length;
            return {
              label: option,
              count,
              percent: answeredValues.length > 0 ? (count / answeredValues.length) * 100 : 0,
            };
          }),
        };
      }

      const textAnswerCounts = new Map<string, number>();
      const textAnswers = answeredValues
        .map((value) => String(value).trim())
        .filter(Boolean);

      textAnswers.forEach((value) => {
        textAnswerCounts.set(value, (textAnswerCounts.get(value) || 0) + 1);
      });

      const topAnswers = [...textAnswerCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([label, count]) => ({ label, count }));

      const latestAnswers = answeredResponses
        .slice(-3)
        .map((response) => String(response.answers[question.id]).trim())
        .filter(Boolean)
        .reverse();

      return {
        ...baseSummary,
        textStats: {
          uniqueAnswers: textAnswerCounts.size,
          topAnswers,
          latestAnswers,
        },
      };
    });

    const recentResponses = [...responses]
      .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
      .slice(0, 6);

    return {
      totalResponses,
      overallCompletion,
      strongestQuestion,
      weakestQuestion,
      categoryQuestion,
      categoryData,
      averageNumeric,
      numericQuestion,
      emojiScore,
      emojiQuestion: sentimentQuestion,
      questionChartData,
      questionSummaries,
      recentResponses,
    };
  }, [form, responses]);

  useEffect(() => {
    if (!dashboard?.questionSummaries.length) {
      return;
    }

    setSelectedQuestionId((current) => {
      if (current && dashboard.questionSummaries.some((summary) => summary.id === current)) {
        return current;
      }

      return dashboard.questionSummaries[0].id;
    });
  }, [dashboard]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#eef4fb] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#eef4fb] flex items-center justify-center px-4">
        <Card className="w-full max-w-lg border-slate-200 bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-slate-900">หน้านี้สำหรับผู้ดูแลระบบ</CardTitle>
            <CardDescription>
              ลิงก์ที่แชร์ให้ผู้ใช้งานทั่วไปจะเปิดได้เฉพาะหน้ากรอกแบบฟอร์มเท่านั้น
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-600">
            <p>หากต้องการดูสรุปผล กรุณาเข้าใช้งานจากเบราว์เซอร์ของผู้สร้างฟอร์มหรือเปิดจากหน้าแอดมินของระบบ</p>
            <Button className="bg-[#2563eb] text-white hover:bg-[#1d4ed8]" onClick={() => navigate('/')}>
              กลับไปหน้าแอดมิน
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!form || !dashboard) {
    return (
      <div className="min-h-screen bg-[#eef4fb] flex items-center justify-center px-4">
        <Card className="w-full max-w-md border-slate-200 bg-white shadow-lg">
          <CardContent className="pt-6 text-center text-slate-600">ไม่พบแบบฟอร์มนี้</CardContent>
        </Card>
      </div>
    );
  }

  const categoryChartConfig = Object.fromEntries(
    dashboard.categoryData.map((item) => [item.label, { label: item.label, color: item.fill }]),
  );
  const selectedQuestionSummary = dashboard.questionSummaries.find((summary) => summary.id === selectedQuestionId) || dashboard.questionSummaries[0];
  const compactRecentResponses = dashboard.recentResponses.slice(0, 4).map((response) => ({
    id: response.id,
    respondentName: response.respondentName,
    submittedAt: formatDate(response.submittedAt),
    highlights: form.questions
      .filter((question) => hasAnswer(question, response.answers[question.id]))
      .slice(0, 2)
      .map((question) => `${question.text}: ${getAnswerDisplay(response.answers[question.id])}`)
      .join(' | '),
  }));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_22%),radial-gradient(circle_at_85%_8%,_rgba(14,165,233,0.16),_transparent_20%),linear-gradient(180deg,#eef6ff_0%,#f8fbff_46%,#ffffff_100%)] px-4 py-5 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Card className="overflow-hidden rounded-[30px] border border-[#c6dafc] bg-[linear-gradient(135deg,#061427_0%,#0b2345_52%,#123b74_100%)] text-white shadow-[0_24px_70px_rgba(8,20,48,0.2)]">
          <div className="h-1 bg-gradient-to-r from-[#38bdf8] via-[#60a5fa] to-[#93c5fd]" />
          <CardHeader className="gap-4 px-5 pb-5 pt-5 md:px-6 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-medium text-sky-100">
                <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
                Private dashboard
              </div>
              <Button
                variant="ghost"
                className="mb-2 mt-1 h-auto px-0 text-slate-200 hover:bg-transparent hover:text-white"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-4 h-4" />
                กลับหน้าหลัก
              </Button>
              <CardTitle className="text-[28px] font-bold tracking-tight text-white md:text-[34px]">รายงานสรุปผลกิจกรรม</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
                วิเคราะห์ข้อมูลจากการตอบแบบฟอร์มของ {form.title}
              </CardDescription>

              <div className="mt-4 flex flex-wrap gap-2.5 text-xs text-slate-200 md:text-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                  <Users className="h-3.5 w-3.5 text-[#7dd3fc]" />
                  <span>{dashboard.totalResponses} คำตอบ</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#7dd3fc]" />
                  <span>สร้างเมื่อ {formatDate(form.createdAt)}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-[#bfdbfe]" />
                  <span>เกณฑ์มาตรฐาน {TARGET_RATE}%</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-start">
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={copyLink}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์ฟอร์ม'}
              </Button>
              <Button className="bg-[#2563eb] text-white hover:bg-[#1d4ed8]" onClick={exportCsv} disabled={dashboard.totalResponses === 0}>
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
        </Card>

        {dashboard.totalResponses === 0 ? (
          <Card className="border-slate-200 bg-white shadow-md">
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">ยังไม่มีคำตอบสำหรับสรุปผล</h3>
              <p className="mt-2 text-slate-500">เริ่มแชร์ลิงก์แบบฟอร์มก่อน แล้ว dashboard นี้จะคำนวณผลให้โดยอัตโนมัติ</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="rounded-[24px] border-[#d8e6fb] bg-white/94 shadow-[0_14px_34px_rgba(37,99,235,0.08)]">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb]">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">ผู้ตอบแบบประเมิน</p>
                    <p className="text-3xl font-bold text-slate-900">{dashboard.totalResponses}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-[#d8e6fb] bg-white/94 shadow-[0_14px_34px_rgba(37,99,235,0.08)]">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284c7]">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">คะแนนความสมบูรณ์เฉลี่ยรวม</p>
                    <p className="text-3xl font-bold text-[#1d4ed8]">{formatPercent(dashboard.overallCompletion)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-[#d8e6fb] bg-white/94 shadow-[0_14px_34px_rgba(37,99,235,0.08)]">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-[#0891b2]">
                    <Medal className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">จุดเด่น</p>
                    <p className="text-lg font-bold leading-snug text-slate-900">{dashboard.strongestQuestion ? formatQuestionLabel(dashboard.strongestQuestion.text) : 'ไม่มีข้อมูล'}</p>
                    <p className="text-sm text-slate-500">{dashboard.strongestQuestion ? formatPercent(dashboard.strongestQuestion.responseRate) : '-'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-[#d8e6fb] bg-white/94 shadow-[0_14px_34px_rgba(37,99,235,0.08)]">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-[#4f46e5]">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">จุดที่ควรพัฒนา</p>
                    <p className="text-lg font-bold leading-snug text-slate-900">{dashboard.weakestQuestion ? formatQuestionLabel(dashboard.weakestQuestion.text) : 'ไม่มีข้อมูล'}</p>
                    <p className="text-sm text-slate-500">{dashboard.weakestQuestion ? formatPercent(dashboard.weakestQuestion.responseRate) : '-'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.24fr)_minmax(320px,0.76fr)] xl:items-start">
              <Card className="rounded-[26px] border-[#d8e6fb] bg-white/95 shadow-[0_16px_36px_rgba(37,99,235,0.08)]">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold text-slate-900">ผลลัพธ์รายหัวข้อ</CardTitle>
                  <CardDescription>เลือกหัวข้อที่ต้องการ แล้วดูผลจริงได้ทันทีในกล่องเดียว</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {dashboard.questionSummaries.map((summary, index) => (
                      <Button
                        key={summary.id}
                        type="button"
                        variant="outline"
                        className={`h-auto shrink-0 rounded-full px-4 py-2 ${selectedQuestionSummary?.id === summary.id ? 'border-[#2563eb] bg-blue-50 text-[#1d4ed8]' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                        onClick={() => setSelectedQuestionId(summary.id)}
                      >
                        <span className="mr-2 text-xs text-slate-400">{index + 1}</span>
                        {summary.shortLabel}
                      </Button>
                    ))}
                  </div>

                  {selectedQuestionSummary ? (
                    <div className="rounded-[26px] border border-[#d8e6fb] bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)] p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">
                            {`หัวข้อ ${dashboard.questionSummaries.findIndex((summary) => summary.id === selectedQuestionSummary.id) + 1}`}
                          </div>
                          <h3 className="mt-3 text-2xl font-semibold text-slate-900">{selectedQuestionSummary.text}</h3>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{formatQuestionType(selectedQuestionSummary.type)}</span>
                            <span className={`rounded-full px-3 py-1 ${selectedQuestionSummary.required ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                              {selectedQuestionSummary.required ? 'คำถามบังคับ' : 'คำถามไม่บังคับ'}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                            <p className="text-xs text-slate-500">ตอบแล้ว</p>
                            <p className="text-lg font-bold text-slate-900">{selectedQuestionSummary.answeredCount}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                            <p className="text-xs text-slate-500">อัตราการตอบ</p>
                            <p className="text-lg font-bold text-[#1d4ed8]">{formatPercent(selectedQuestionSummary.responseRate)}</p>
                          </div>
                        </div>
                      </div>

                      {selectedQuestionSummary.numericStats ? (
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-500">ค่าเฉลี่ย</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{selectedQuestionSummary.numericStats.average.toFixed(1)}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-500">ต่ำสุด</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{selectedQuestionSummary.numericStats.min.toFixed(1)}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-500">สูงสุด</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{selectedQuestionSummary.numericStats.max.toFixed(1)}</p>
                          </div>
                        </div>
                      ) : null}

                      {selectedQuestionSummary.optionStats ? (
                        <div className="mt-5 grid gap-3 lg:grid-cols-2">
                          {selectedQuestionSummary.optionStats.map((option) => (
                            <div key={`${selectedQuestionSummary.id}-${option.label}`} className="rounded-2xl bg-white p-4 shadow-sm">
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <span className="font-medium text-slate-800">{option.label}</span>
                                <span className="text-sm font-semibold text-slate-600">{option.count} ครั้ง</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100">
                                <div className="h-2 rounded-full bg-[#2563eb]" style={{ width: `${Math.min(option.percent, 100)}%` }} />
                              </div>
                              <p className="mt-2 text-xs text-slate-500">คิดเป็น {formatPercent(option.percent)} ของผู้ตอบหัวข้อนี้</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {selectedQuestionSummary.textStats ? (
                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-slate-700">คำตอบที่พบบ่อย</p>
                            <p className="mt-1 text-xs text-slate-500">คำตอบไม่ซ้ำ {selectedQuestionSummary.textStats.uniqueAnswers} แบบ</p>
                            <div className="mt-3 space-y-2">
                              {selectedQuestionSummary.textStats.topAnswers.length > 0 ? selectedQuestionSummary.textStats.topAnswers.map((answer) => (
                                <div key={`${selectedQuestionSummary.id}-${answer.label}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  <span className="font-medium">{answer.label}</span>
                                  <span className="ml-2 text-slate-500">({answer.count} ครั้ง)</span>
                                </div>
                              )) : <p className="text-sm text-slate-500">ยังไม่มีคำตอบ</p>}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold text-slate-700">คำตอบล่าสุด</p>
                            <div className="mt-3 space-y-2">
                              {selectedQuestionSummary.textStats.latestAnswers.length > 0 ? selectedQuestionSummary.textStats.latestAnswers.map((answer, answerIndex) => (
                                <div key={`${selectedQuestionSummary.id}-latest-${answerIndex}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  {answer}
                                </div>
                              )) : <p className="text-sm text-slate-500">ยังไม่มีคำตอบ</p>}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">ข้อมูลจริงจากคำตอบล่าสุด</p>
                            <p className="mt-1 text-xs text-slate-500">ดึงจากคำตอบจริงของหัวข้อนี้โดยตรง</p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3">
                          {selectedQuestionSummary.recentEntries.length > 0 ? selectedQuestionSummary.recentEntries.map((entry, entryIndex) => (
                            <div key={`${selectedQuestionSummary.id}-entry-${entryIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-slate-900">{entry.respondentName}</p>
                                <p className="text-xs text-slate-500">{entry.submittedAt}</p>
                              </div>
                              <p className="mt-2 text-sm text-slate-700">{entry.answer}</p>
                            </div>
                          )) : <p className="text-sm text-slate-500">ยังไม่มีคำตอบจริงสำหรับหัวข้อนี้</p>}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-[26px] border-[#d8e6fb] bg-white/95 shadow-[0_16px_36px_rgba(37,99,235,0.08)]">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-slate-900">Insight เพิ่มเติม</CardTitle>
                    <CardDescription>ตัวชี้วัดหลักที่ควรดูต่อจากผลรายหัวข้อ</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="rounded-2xl bg-[#eff6ff] p-5">
                      <div className="flex items-center gap-3 text-[#2563eb]">
                        <Timer className="h-5 w-5" />
                        <span className="font-medium">ค่าเฉลี่ยคำถามเชิงตัวเลข</span>
                      </div>
                      <p className="mt-3 text-3xl font-bold text-slate-900">{dashboard.averageNumeric !== null ? dashboard.averageNumeric.toFixed(1) : '-'}</p>
                      <p className="mt-1 text-sm text-slate-500">{dashboard.numericQuestion?.text || 'ยังไม่พบคำถามเชิงตัวเลขในฟอร์มนี้'}</p>
                    </div>

                    <div className="rounded-2xl bg-[#f0f9ff] p-5">
                      <div className="flex items-center gap-3 text-[#0284c7]">
                        <TrendingUp className="h-5 w-5" />
                        <span className="font-medium">คะแนนความรู้สึกเฉลี่ย</span>
                      </div>
                      <p className="mt-3 text-3xl font-bold text-slate-900">{dashboard.emojiScore !== null ? formatPercent(dashboard.emojiScore) : '-'}</p>
                      <p className="mt-1 text-sm text-slate-500">{dashboard.emojiQuestion?.text || 'ยังไม่พบคำถามแบบไอคอนในฟอร์มนี้'}</p>
                    </div>

                    <div className="rounded-2xl bg-[#f8fbff] p-5">
                      <p className="text-sm font-semibold text-slate-700">ภาพรวมเชิงปฏิบัติ</p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-600">
                        <li>คำถามที่ตอบครบมากที่สุด: {dashboard.strongestQuestion?.text || 'ไม่มีข้อมูล'}</li>
                        <li>คำถามที่ควรช่วยกระตุ้นการตอบเพิ่ม: {dashboard.weakestQuestion?.text || 'ไม่มีข้อมูล'}</li>
                        <li>ค่าเฉลี่ยการตอบครบทั้งฟอร์ม: {formatPercent(dashboard.overallCompletion)}</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[26px] border-[#d8e6fb] bg-white/95 shadow-[0_16px_36px_rgba(37,99,235,0.08)]">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-slate-900">คำตอบล่าสุด</CardTitle>
                    <CardDescription>ดูภาพรวมคำตอบชุดล่าสุดแบบสั้น ๆ</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {compactRecentResponses.map((response) => (
                      <div key={response.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-900">{response.respondentName}</p>
                          <p className="text-xs text-slate-500">{response.submittedAt}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{response.highlights || 'ไม่ได้ระบุ'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)] xl:items-start">
                          <Card className="rounded-[26px] border-[#d8e6fb] bg-white/95 shadow-[0_16px_36px_rgba(37,99,235,0.08)]">
                            <CardHeader>
                              <CardTitle className="text-xl font-semibold text-slate-900">อัตราการตอบรายหัวข้อ (%)</CardTitle>
                              <CardDescription>เส้นประสีแดงคือเกณฑ์มาตรฐาน {TARGET_RATE}%</CardDescription>
                            </CardHeader>
                            <CardContent>
                              <ChartContainer
                                className="h-[280px] w-full"
                                config={{
                                  rate: { label: 'คะแนน (%)', color: '#3b82f6' },
                                }}
                              >
                                <BarChart data={dashboard.questionChartData} margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                  <XAxis dataKey="question" tickLine={false} axisLine={false} interval={0} angle={-8} textAnchor="end" height={52} />
                                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={42} />
                                  <ReferenceLine y={TARGET_RATE} stroke="#ef4444" strokeDasharray="6 4" />
                                  <ChartTooltip
                                    cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                                    content={
                                      <ChartTooltipContent
                                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullQuestion || ''}
                                        formatter={(value) => (
                                          <div className="flex items-center justify-between gap-6">
                                            <span className="text-slate-500">อัตราการตอบ</span>
                                            <span className="font-semibold text-slate-900">{formatPercent(Number(value))}</span>
                                          </div>
                                        )}
                                      />
                                    }
                                  />
                                  <Bar dataKey="rate" radius={[10, 10, 0, 0]} fill="var(--color-rate)" />
                                </BarChart>
                              </ChartContainer>
                            </CardContent>
                          </Card>

                          <Card className="rounded-[26px] border-[#d8e6fb] bg-white/95 shadow-[0_16px_36px_rgba(37,99,235,0.08)]">
                            <CardHeader>
                              <CardTitle className="text-xl font-semibold text-slate-900">
                                {dashboard.categoryQuestion ? `สัดส่วนผู้เข้าร่วมตาม${dashboard.categoryQuestion.text}` : 'สัดส่วนผู้เข้าร่วม'}
                              </CardTitle>
                              <CardDescription>นับจากคำตอบของคำถามที่ใช้แบ่งกลุ่มผู้ตอบ</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                              {dashboard.categoryData.length > 0 ? (
                                <>
                                  <ChartContainer className="h-[220px] w-full" config={categoryChartConfig}>
                                    <PieChart>
                                      <ChartTooltip
                                        content={
                                          <ChartTooltipContent
                                            hideLabel
                                            formatter={(value, name) => (
                                              <div className="flex items-center justify-between gap-6">
                                                <span className="text-slate-500">{String(name)}</span>
                                                <span className="font-semibold text-slate-900">{Number(value)} คน</span>
                                              </div>
                                            )}
                                          />
                                        }
                                      />
                                      <Pie
                                        data={dashboard.categoryData}
                                        dataKey="count"
                                        nameKey="label"
                                        innerRadius={52}
                                        outerRadius={92}
                                        paddingAngle={3}
                                      >
                                        {dashboard.categoryData.map((item) => (
                                          <Cell key={item.label} fill={item.fill} />
                                        ))}
                                      </Pie>
                                    </PieChart>
                                  </ChartContainer>

                                  <div className="grid gap-3">
                                    {dashboard.categoryData.map((item) => (
                                      <div key={item.label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                                          <span className="font-medium text-slate-700">{item.label}</span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-900">{item.count} คน</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div className="rounded-2xl bg-slate-50 px-4 py-12 text-center text-slate-500">
                                  ยังไม่มีข้อมูลเพียงพอสำหรับสร้างกราฟสัดส่วน
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
          </>
        )}
      </div>
    </div>
  );
}
