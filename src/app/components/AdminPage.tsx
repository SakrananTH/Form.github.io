import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Form, Question } from '../../utils/api';
import { grantResultsAccess, revokeResultsAccess } from '../../utils/adminAccess';
import { createAppUrl } from '../../utils/appUrl';
import { getScaleLabel, ICON_SCALE_OPTIONS, isIconScaleType } from '../../utils/iconScale';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardList,
  Copy,
  LayoutDashboard,
  Link2,
  Lock,
  ImagePlus,
  Plus,
  History,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

const MAX_QUESTION_IMAGE_SIZE = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function formatThaiDate(dateString: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

function getDeleteErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'เกิดข้อผิดพลาดในการลบประวัติฟอร์ม';
  }

  if (/live delete is blocked/i.test(error.message)) {
    return 'ระบบสามารถอ่านข้อมูลจริงได้ แต่สิทธิ์ Supabase ปัจจุบันยังไม่อนุญาตให้ลบข้อมูล live จากหน้าเว็บนี้';
  }

  if (/live delete endpoint is not available/i.test(error.message)) {
    return 'ระบบ live ที่ใช้งานอยู่ยังไม่เปิด route สำหรับลบฟอร์ม และการลบตรงจาก Supabase ก็ยังไม่ยืนยันผลได้ จึงรีเว็บแล้วข้อมูลเดิมกลับมาแสดงอีกครั้ง';
  }

  if (/request failed|failed to delete form/i.test(error.message)) {
    return 'ระบบดึงข้อมูลจริงมาแสดงได้แล้ว แต่การลบข้อมูลจริงยังไม่สำเร็จ เพราะบริการฝั่ง server ที่กำลังใช้งานยังไม่เปิดคำสั่งลบบนระบบ live';
  }

  return error.message;
}

interface DeletePreview {
  questionCount: number;
  responseCount: number;
  lastSubmittedAt: string | null;
}

function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: crypto.randomUUID(),
    text: '',
    type: 'text',
    placeholder: '',
    required: true,
    ...overrides,
  };
}

function getDefaultOptions(type: Question['type']) {
  if (type === 'emoji-scale' || type === 'icon-scale') {
    return [...ICON_SCALE_OPTIONS];
  }

  if (type === 'radio' || type === 'checkbox' || type === 'select') {
    return ['ตัวเลือก 1', 'ตัวเลือก 2'];
  }

  return undefined;
}

function buildExerciseTemplate(): Question[] {
  return [
    createQuestion({
      text: 'แผนก',
      type: 'text',
      placeholder: 'เช่น ฝ่ายการตลาด',
    }),
    createQuestion({
      text: 'ประเภทการออกกำลังกาย',
      type: 'select',
      placeholder: '-- เลือกประเภท --',
      options: ['เดิน', 'วิ่ง', 'ปั่นจักรยาน', 'โยคะ', 'เวทเทรนนิ่ง', 'กีฬาอื่น ๆ'],
    }),
    createQuestion({
      text: 'ระยะเวลา (นาที)',
      type: 'number',
      placeholder: 'เช่น 30',
    }),
    createQuestion({
      text: 'ความรู้สึกหลังออกกำลังกาย',
      type: 'icon-scale',
      options: [...ICON_SCALE_OPTIONS],
    }),
    createQuestion({
      text: 'ข้อเสนอแนะ (ถ้ามี)',
      type: 'textarea',
      placeholder: 'เช่น อยากให้มีกิจกรรมเพิ่มเติม...',
      required: false,
    }),
  ];
}

export function AdminPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdFormId, setCreatedFormId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formHistory, setFormHistory] = useState<Form[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [pendingDeleteForm, setPendingDeleteForm] = useState<Form | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
  const [deleteRequestError, setDeleteRequestError] = useState<string | null>(null);

  const questionCount = questions.length;
  const requiredCount = questions.filter((question) => question.required !== false).length;
  const publicFormLink = createdFormId ? createAppUrl(`/form/${createdFormId}`) : '';
  const previewQuestions = questions.slice(0, 4);

  const loadFormHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const result = await api.getAllForms();
      const sortedForms = [...result.forms].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      setFormHistory(sortedForms);
    } catch (error) {
      console.error('Error loading forms:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadFormHistory();
  }, []);

  useEffect(() => {
    if (!pendingDeleteForm) {
      setDeletePreview(null);
      setDeleteRequestError(null);
      setIsLoadingDeletePreview(false);
      return;
    }

    let isActive = true;

    setDeleteRequestError(null);
    setIsLoadingDeletePreview(true);
    setDeletePreview({
      questionCount: pendingDeleteForm.questions.length,
      responseCount: 0,
      lastSubmittedAt: null,
    });

    void (async () => {
      try {
        const { responses } = await api.getResponses(pendingDeleteForm.id);

        if (!isActive) {
          return;
        }

        const latestSubmittedAt = responses.reduce<string | null>((latest, response) => {
          if (!latest) {
            return response.submittedAt;
          }

          return new Date(response.submittedAt).getTime() > new Date(latest).getTime() ? response.submittedAt : latest;
        }, null);

        setDeletePreview({
          questionCount: pendingDeleteForm.questions.length,
          responseCount: responses.length,
          lastSubmittedAt: latestSubmittedAt,
        });
      } catch (error) {
        console.error('Error loading delete preview:', error);

        if (!isActive) {
          return;
        }

        setDeletePreview({
          questionCount: pendingDeleteForm.questions.length,
          responseCount: 0,
          lastSubmittedAt: null,
        });
      } finally {
        if (isActive) {
          setIsLoadingDeletePreview(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [pendingDeleteForm]);

  const builderStats = useMemo(() => ([
    {
      label: 'ปลายทางของลิงก์',
      value: 'หน้า public อย่างเดียว',
      icon: Link2,
      tone: 'bg-blue-50 text-[#2563eb]',
    },
    {
      label: 'การดูสรุปผล',
      value: createdFormId ? 'เปิดได้จากเครื่องนี้' : 'จะเปิดหลังสร้างฟอร์ม',
      icon: Lock,
      tone: 'bg-emerald-50 text-[#15803d]',
    },
    {
      label: 'สถานะ',
      value: createdFormId ? 'พร้อมแชร์และติดตามผล' : questionCount > 0 ? 'กำลังจัดแบบร่าง' : 'เริ่มสร้างได้ทันที',
      icon: createdFormId ? ShieldCheck : ClipboardList,
      tone: 'bg-amber-50 text-[#d97706]',
    },
  ]), [createdFormId, questionCount]);

  const addQuestion = () => {
    setQuestions([...questions, createQuestion()]);
  };

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(questions.map(q =>
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const updateQuestionImage = async (questionId: string, file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    if (file.size > MAX_QUESTION_IMAGE_SIZE) {
      alert('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
      return;
    }

    try {
      const imageUrl = await readFileAsDataUrl(file);
      setQuestions((current) => current.map((question) => (
        question.id === questionId
          ? { ...question, imageUrl, imageName: file.name }
          : question
      )));
    } catch (error) {
      console.error('Error reading question image:', error);
      alert('เกิดข้อผิดพลาดในการโหลดรูปภาพ');
    }
  };

  const removeQuestionImage = (questionId: string) => {
    setQuestions((current) => current.map((question) => (
      question.id === questionId
        ? { ...question, imageUrl: undefined, imageName: undefined }
        : question
    )));
  };

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const changeQuestionType = (id: string, type: Question['type']) => {
    setQuestions(questions.map((question) => {
      if (question.id !== id) {
        return question;
      }

      const needsOptions = type === 'radio' || type === 'checkbox' || type === 'select' || isIconScaleType(type);

      return {
        ...question,
        type,
        options: needsOptions ? (question.options?.length ? question.options : getDefaultOptions(type)) : undefined,
      };
    }));
  };

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId) {
        return { ...q, options: [...(q.options || []), ''] };
      }
      return q;
    }));
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options) {
        const newOptions = [...q.options];
        newOptions[optionIndex] = value;
        return { ...q, options: newOptions };
      }
      return q;
    }));
  };

  const deleteOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options) {
        return { ...q, options: q.options.filter((_, i) => i !== optionIndex) };
      }
      return q;
    }));
  };

  const applyExerciseTemplate = () => {
    setTitle('แบบสอบถามการออกกำลังกายก่อนเริ่มงาน');
    setQuestions(buildExerciseTemplate());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || questions.length === 0) {
      alert('กรุณาใส่ชื่อฟอร์มและเพิ่มคำถามอย่างน้อย 1 ข้อ');
      return;
    }

    const hasInvalidQuestion = questions.some((question) => {
      if (!question.text.trim()) {
        return true;
      }

      if (question.type === 'radio' || question.type === 'checkbox' || question.type === 'select' || isIconScaleType(question.type)) {
        return !question.options?.length || question.options.some((option) => !option.trim());
      }

      return false;
    });

    if (hasInvalidQuestion) {
      alert('กรุณากรอกคำถามและตัวเลือกให้ครบก่อนสร้างฟอร์ม');
      return;
    }

    setIsCreating(true);
    try {
      const result = await api.createForm(title, questions);
      grantResultsAccess(result.formId);
      setCreatedFormId(result.formId);
      await loadFormHistory();
    } catch (error) {
      console.error('Error creating form:', error);
      alert('เกิดข้อผิดพลาดในการสร้างฟอร์ม');
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = () => {
    if (createdFormId) {
      const link = createAppUrl(`/form/${createdFormId}`);
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyHistoryLink = (formId: string) => {
    const link = createAppUrl(`/form/${formId}`);
    navigator.clipboard.writeText(link);
    setCopiedFormId(formId);
    setTimeout(() => setCopiedFormId((current) => (current === formId ? null : current)), 2000);
  };

  const deleteHistoryForm = async (form: Form) => {
    setDeletingFormId(form.id);
    setDeleteRequestError(null);
    try {
      await api.deleteForm(form.id);
      revokeResultsAccess(form.id);
      setFormHistory((current) => current.filter((item) => item.id !== form.id));

      if (createdFormId === form.id) {
        setCreatedFormId(null);
      }

      setPendingDeleteForm(null);
    } catch (error) {
      console.error('Error deleting form:', error);
      setDeleteRequestError(getDeleteErrorMessage(error));
    } finally {
      setDeletingFormId(null);
    }
  };

  const viewResults = (formId?: string | null) => {
    if (formId) {
      grantResultsAccess(formId);
      navigate(`/results/${formId}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef3ea] bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_24%),radial-gradient(circle_at_85%_10%,_rgba(21,128,61,0.14),_transparent_20%),linear-gradient(180deg,#eef3ea_0%,#f8faf8_42%,#ffffff_100%)] px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-[#d7e6d8] bg-[#07111b] text-white shadow-[0_28px_90px_rgba(7,17,27,0.22)]">
          <div className="grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[1.18fr_0.82fr] lg:px-10 lg:py-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-slate-200 backdrop-blur">
                <LayoutDashboard className="h-4 w-4" />
                Admin Workspace
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-white md:text-5xl">สร้างแบบฟอร์ม จัดการลิงก์ และเปิดดูสรุปผลจากคอนโซลเดียว</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
                ปรับหน้าให้เหลือเฉพาะงานที่ผู้ดูแลต้องใช้จริง ไม่ต้องไล่อ่าน flow การใช้งานแล้วค่อยไปกดหลายจุด ทุกอย่างสำคัญจะถูกรวมไว้ข้าง ๆ ฟอร์มนี้ทันที
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">ตอนนี้กำลังทำ</p>
                  <p className="mt-2 text-lg font-semibold text-white">{createdFormId ? 'จัดการแบบฟอร์มที่พร้อมแชร์' : 'ออกแบบแบบร่างใหม่'}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">ลิงก์ที่ปลายทาง</p>
                  <p className="mt-2 text-lg font-semibold text-white">Public form only</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">สรุปผล</p>
                  <p className="mt-2 text-lg font-semibold text-white">เปิดจากเครื่องผู้สร้าง</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button className="h-11 rounded-xl bg-[#f3f7f1] px-5 text-slate-950 hover:bg-white" type="button" onClick={applyExerciseTemplate}>
                  <Sparkles className="h-4 w-4" />
                  โหลดฟอร์มตัวอย่าง
                </Button>
                <Button variant="outline" className="h-11 rounded-xl border-white/20 bg-white/5 px-5 text-white hover:bg-white/10 hover:text-white" type="button" onClick={addQuestion}>
                  <Plus className="h-4 w-4" />
                  เพิ่มคำถามใหม่
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {builderStats.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="rounded-3xl border border-white/10 bg-white/8 p-5 backdrop-blur">
                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="text-sm text-slate-300">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold text-white">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.95fr)]">
          <Card className="border-white/70 bg-white/92 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-slate-900">ออกแบบแบบฟอร์ม</CardTitle>
              <CardDescription>ตั้งชื่อฟอร์ม ปรับคำถาม และจัดรายละเอียดที่ต้องการให้ผู้ตอบเห็นบนหน้า public page</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="rounded-[28px] border border-[#dbe6da] bg-[#f6faf6] p-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">ชื่อแบบฟอร์ม</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
                    placeholder="เช่น แบบสอบถามการออกกำลังกายก่อนเริ่มงาน วันที่ 30 เมษายน"
                    required
                  />
                </div>

                <div className="rounded-[28px] border border-[#dbe6da] bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f766e]">Preset</p>
                      <h2 className="mt-1 text-2xl font-semibold text-slate-900">โครงฟอร์มออกกำลังกายพร้อมใช้</h2>
                      <p className="mt-1 text-sm text-slate-500">เพิ่มชื่อ แผนก ประเภทกิจกรรม เวลา ระดับความรู้สึกแบบไอคอน และข้อเสนอแนะให้อัตโนมัติ</p>
                    </div>

                    <Button type="button" className="h-11 rounded-xl bg-[#0f766e] px-5 text-white hover:bg-[#115e59]" onClick={applyExerciseTemplate}>
                      <Sparkles className="h-4 w-4" />
                      ใช้โครงนี้ทันที
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">รายการคำถาม</h3>
                    <p className="text-sm text-slate-500">จัดลำดับและปรับ field ที่ต้องการให้ผู้ตอบเห็นบนลิงก์ public</p>
                  </div>
                </div>

                {questions.length === 0 && (
                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-slate-500">
                    กดโหลด preset หรือเพิ่มคำถามด้วยตัวเองเพื่อเริ่มสร้างแบบฟอร์ม
                  </div>
                )}

                <div className="space-y-5">
                  {questions.map((question, index) => (
                    <div key={question.id} className="rounded-[30px] border border-[#dbe6da] bg-[#fbfdfb] p-5 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[#0f766e]">คำถามที่ {index + 1}</p>
                          <p className="mt-1 text-sm text-slate-500">{question.required !== false ? 'บังคับตอบ' : 'ตอบหรือไม่ตอบก็ได้'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(question.id)}
                          className="rounded-xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label="ลบคำถาม"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">คำถาม</label>
                          <input
                            type="text"
                            value={question.text}
                            onChange={(e) => updateQuestion(question.id, 'text', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-emerald-100"
                            placeholder="พิมพ์คำถามของคุณ"
                            required
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">ประเภทคำถาม</label>
                          <select
                            value={question.type === 'emoji-scale' ? 'icon-scale' : question.type}
                            onChange={(e) => changeQuestionType(question.id, e.target.value as Question['type'])}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-emerald-100"
                          >
                            <option value="text">ข้อความสั้น</option>
                            <option value="textarea">ข้อความยาว</option>
                            <option value="number">ตัวเลข</option>
                            <option value="select">ดรอปดาวน์</option>
                            <option value="radio">เลือกคำตอบเดียว</option>
                            <option value="checkbox">เลือกได้หลายคำตอบ</option>
                            <option value="icon-scale">ระดับความรู้สึกแบบไอคอน</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">Placeholder / คำใบ้</label>
                          <input
                            type="text"
                            value={question.placeholder || ''}
                            onChange={(e) => updateQuestion(question.id, 'placeholder', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-emerald-100"
                            placeholder="เช่น กรุณากรอกข้อมูลของคุณ"
                          />
                        </div>

                        <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={question.required !== false}
                            onChange={(e) => updateQuestion(question.id, 'required', e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[#0f766e] focus:ring-emerald-500"
                          />
                          บังคับตอบ
                        </label>
                      </div>

                      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">รูปภาพประกอบคำถาม</p>
                            <p className="text-xs text-slate-500">อัปโหลดภาพเพื่อแสดงเหนือคำถามบนลิงก์ public รองรับไฟล์ไม่เกิน 2 MB</p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0f766e] px-4 text-sm font-medium text-white transition hover:bg-[#115e59]">
                              <ImagePlus className="h-4 w-4" />
                              {question.imageUrl ? 'เปลี่ยนรูปภาพ' : 'เพิ่มรูปภาพ'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0] || null;
                                  e.target.value = '';
                                  await updateQuestionImage(question.id, file);
                                }}
                              />
                            </label>

                            {question.imageUrl && (
                              <Button type="button" variant="outline" className="h-11 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeQuestionImage(question.id)}>
                                <X className="h-4 w-4" />
                                ลบรูปภาพ
                              </Button>
                            )}
                          </div>
                        </div>

                        {question.imageUrl ? (
                          <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
                            <img
                              src={question.imageUrl}
                              alt={question.imageName || question.text || 'รูปภาพประกอบคำถาม'}
                              className="max-h-[280px] w-full object-cover"
                            />
                            <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                              {question.imageName || 'รูปภาพประกอบคำถาม'}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                            ยังไม่ได้เพิ่มรูปภาพสำหรับคำถามนี้
                          </div>
                        )}
                      </div>

                      {(question.type === 'radio' || question.type === 'checkbox' || question.type === 'select' || isIconScaleType(question.type)) && (
                        <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{isIconScaleType(question.type) ? 'ระดับไอคอน' : 'ตัวเลือก'}</p>
                              <p className="text-xs text-slate-500">{isIconScaleType(question.type) ? 'ระบบจะแสดงเป็น icon cards ให้ผู้ตอบเลือก' : 'ใช้เป็นตัวเลือกบนหน้า public form'}</p>
                            </div>
                            <Button type="button" variant="outline" className="rounded-xl border-slate-200" onClick={() => addOption(question.id)}>
                              <Plus className="h-4 w-4" />
                              เพิ่มตัวเลือก
                            </Button>
                          </div>

                          {isIconScaleType(question.type) && (
                            <div className="mb-4 flex flex-wrap gap-2">
                              {question.options?.map((option, optionIndex) => (
                                <span key={`${question.id}-preview-${optionIndex}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                  {getScaleLabel(option, optionIndex)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex gap-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(question.id, optionIndex, e.target.value)}
                                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-emerald-100"
                                  placeholder={`ตัวเลือก ${optionIndex + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteOption(question.id, optionIndex)}
                                  className="rounded-2xl border border-rose-200 bg-white px-4 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
                                  aria-label={`ลบตัวเลือก ${optionIndex + 1}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="button" className="h-12 rounded-2xl bg-[#0f766e] px-5 text-white hover:bg-[#115e59]" onClick={addQuestion}>
                    <Plus className="h-4 w-4" />
                    เพิ่มคำถาม
                  </Button>
                  <Button type="submit" disabled={isCreating} className="h-12 w-full rounded-2xl bg-slate-950 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                    {isCreating ? 'กำลังสร้างฟอร์ม...' : 'สร้างฟอร์มและเปิดสิทธิ์ให้ผู้ดูแล'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-slate-900">แผงควบคุมการเผยแพร่</CardTitle>
                <CardDescription>พรีวิวสิ่งที่จะถูกแชร์ พร้อมจุดคัดลอกลิงก์และเปิดสรุปผลจากพื้นที่เดียว</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#0b3b2e_0%,#0f766e_55%,#1d9d74_100%)] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-emerald-100">Public page preview</p>
                      <h3 className="mt-2 text-2xl font-bold text-white">{title || 'แบบสอบถามการ'}</h3>
                      <p className="mt-2 max-w-sm text-sm text-emerald-50">ลิงก์ที่ส่งให้ทีมจะเปิดหน้าเดียวสำหรับกรอกข้อมูล ไม่มีปุ่มสรุปผลหรือทางลัดไป dashboard</p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">Mode</p>
                      <p className="mt-1 text-sm font-semibold text-white">Public only</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                      <p className="text-xs text-emerald-100">จำนวนคำถาม</p>
                      <p className="mt-1 text-xl font-semibold text-white">{questionCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                      <p className="text-xs text-emerald-100">คำถามบังคับ</p>
                      <p className="mt-1 text-xl font-semibold text-white">{requiredCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                      <p className="text-xs text-emerald-100">สถานะ</p>
                      <p className="mt-1 text-xl font-semibold text-white">{createdFormId ? 'พร้อมแชร์' : 'แบบร่าง'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[26px] border border-[#dbe6da] bg-[#f8fbf8] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f766e]">Live preview</p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900">สิ่งที่ผู้ตอบจะเห็น</h3>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                      <Lock className="h-3.5 w-3.5 text-[#0f766e]" />
                      สรุปผลยังไม่แสดงในลิงก์นี้
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {previewQuestions.map((question) => (
                      <div key={question.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm text-slate-600 shadow-sm">
                        {question.imageUrl && (
                          <img
                            src={question.imageUrl}
                            alt={question.imageName || question.text || 'รูปภาพประกอบคำถาม'}
                            className="max-h-40 w-full object-cover"
                          />
                        )}
                        <div className="px-4 py-3">
                          <span className="font-semibold text-slate-800">{question.text || 'คำถามตัวอย่าง'}</span>
                          <span className="ml-2 text-slate-400">{question.required !== false ? 'จำเป็น' : 'ไม่บังคับ'}</span>
                        </div>
                      </div>
                    ))}
                    {questions.length > 4 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                        และอีก {questions.length - 4} คำถามในหน้าเดียวกัน
                      </div>
                    )}
                    {questions.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        เมื่อเพิ่มคำถามแล้ว preview จะอัปเดตตามทันที
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">แชร์และเปิดสรุปผล</h3>
                      <p className="mt-1 text-sm text-slate-500">พื้นที่เดียวสำหรับคัดลอกลิงก์ public และเข้าสรุปผลจากเครื่องผู้สร้าง</p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${createdFormId ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {createdFormId ? 'พร้อมใช้งาน' : 'รอสร้างฟอร์ม'}
                    </div>
                  </div>

                <div className="mt-4 space-y-4">
                  {createdFormId ? (
                    <div className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                          <Check className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-emerald-900">สร้างฟอร์มเรียบร้อยแล้ว</p>
                          <p className="text-sm text-emerald-700">แชร์ลิงก์ด้านล่างให้ทีมตอบแบบฟอร์มได้ทันที</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      ปุ่มสรุปผลอยู่ด้านล่างนี้ เมื่อกดสร้างฟอร์มแล้วระบบจะเปิดใช้งานให้ทันที
                    </div>
                  )}

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">ลิงก์ public form</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={publicFormLink || 'สร้างฟอร์มก่อน แล้วลิงก์จะปรากฏที่นี่'}
                        readOnly
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                      />
                      <Button
                        type="button"
                        className="h-12 rounded-2xl bg-[#0f766e] px-4 text-white hover:bg-[#115e59] disabled:bg-slate-300 disabled:text-slate-500"
                        onClick={copyLink}
                        disabled={!createdFormId}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      className="h-12 flex-1 rounded-2xl bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500"
                      onClick={() => viewResults(createdFormId)}
                      disabled={!createdFormId}
                    >
                      <BarChart3 className="h-4 w-4" />
                      เปิดสรุปผลส่วนตัว
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 flex-1 rounded-2xl border-slate-200"
                      onClick={() => {
                        setCreatedFormId(null);
                        setTitle('');
                        setQuestions([]);
                      }}
                    >
                      {createdFormId ? 'สร้างฟอร์มใหม่' : 'เริ่มสร้างฟอร์ม'}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/92 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                  <History className="h-5 w-5 text-[#0f766e]" />
                  ประวัติแบบฟอร์มย้อนหลัง
                </CardTitle>
                <CardDescription>เปิดสรุปผลของฟอร์มเก่า หรือคัดลอกลิงก์กลับไปแชร์ได้จากรายการนี้</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingHistory ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    กำลังโหลดประวัติแบบฟอร์ม...
                  </div>
                ) : formHistory.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    ยังไม่มีประวัติแบบฟอร์มย้อนหลัง
                  </div>
                ) : (
                  formHistory.map((form) => {
                    const isCurrentForm = form.id === createdFormId;

                    return (
                      <div key={form.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-slate-900">{form.title}</h3>
                              {isCurrentForm && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">ฟอร์มล่าสุด</span>}
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{formatThaiDate(form.createdAt)}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                            <p className="text-xs text-slate-400">จำนวนคำถาม</p>
                            <p className="text-sm font-semibold text-slate-900">{form.questions.length}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <Button
                            type="button"
                            className="h-11 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                            onClick={() => viewResults(form.id)}
                          >
                            <BarChart3 className="h-4 w-4" />
                            ดูสรุปผลย้อนหลัง
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-full rounded-2xl border-slate-200 bg-white"
                            onClick={() => copyHistoryLink(form.id)}
                          >
                            {copiedFormId === form.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedFormId === form.id ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์ฟอร์ม'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-full rounded-2xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:border-slate-200 disabled:text-slate-400 sm:col-span-2 xl:col-span-1 xl:w-auto"
                            onClick={() => setPendingDeleteForm(form)}
                            disabled={deletingFormId === form.id}
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingFormId === form.id ? 'กำลังลบ...' : 'ลบประวัติ'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog
          open={Boolean(pendingDeleteForm)}
          onOpenChange={(open) => {
            if (!open && !deletingFormId) {
              setPendingDeleteForm(null);
              setDeleteRequestError(null);
            }
          }}
        >
          <DialogContent className="max-w-xl overflow-hidden rounded-[32px] border-0 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_38%,#fff1f2_100%)] p-0 shadow-[0_32px_100px_rgba(15,23,42,0.28)]">
            <div className="relative overflow-hidden px-6 pb-6 pt-6 sm:px-7 sm:pb-7 sm:pt-7">
              <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.28),_transparent_46%),radial-gradient(circle_at_top_right,_rgba(244,63,94,0.2),_transparent_38%)]" />

              <DialogHeader className="relative text-left">
                <div className="mb-4 flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#fb923c_0%,#f43f5e_100%)] text-white shadow-[0_14px_30px_rgba(244,63,94,0.24)]">
                    <Trash2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="inline-flex rounded-full border border-rose-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-500 backdrop-blur">
                      Delete History
                    </div>
                    <DialogTitle className="text-2xl font-bold leading-tight text-slate-950">
                      ลบประวัติฟอร์มนี้ออกจากระบบ
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-slate-600">
                      {pendingDeleteForm ? `ฟอร์ม "${pendingDeleteForm.title}" จะถูกลบพร้อมคำตอบทั้งหมดของฟอร์มนี้ และไม่สามารถกู้คืนกลับมาได้` : 'ฟอร์มนี้จะถูกลบพร้อมคำตอบทั้งหมด และไม่สามารถกู้คืนได้'}
                    </DialogDescription>
                  </div>
                </div>

                <div className="rounded-[26px] border border-rose-100 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-rose-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-rose-400">จำนวนคำถามจริง</p>
                      <p className="mt-2 text-sm font-semibold text-rose-700">
                        {isLoadingDeletePreview ? 'กำลังโหลด...' : `${deletePreview?.questionCount ?? pendingDeleteForm?.questions.length ?? 0} ข้อ`}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-500">จำนวนคำตอบจริง</p>
                      <p className="mt-2 text-sm font-semibold text-amber-700">
                        {isLoadingDeletePreview ? 'กำลังโหลด...' : `${deletePreview?.responseCount ?? 0} ชุดคำตอบ`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">สร้างเมื่อ</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{pendingDeleteForm ? formatThaiDate(pendingDeleteForm.createdAt) : '-'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">ตอบล่าสุด</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {isLoadingDeletePreview ? 'กำลังโหลด...' : deletePreview?.lastSubmittedAt ? formatThaiDate(deletePreview.lastSubmittedAt) : 'ยังไม่มีคำตอบ'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    การลบครั้งนี้จะลบทั้งตัวฟอร์มและคำตอบทั้งหมดของฟอร์มนี้แบบถาวร
                  </div>
                </div>
              </DialogHeader>

              {deleteRequestError && (
                <div className="relative mt-5 rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_100%)] px-4 py-4 text-sm text-amber-800 shadow-sm">
                  <p className="font-semibold text-amber-900">สถานะจากข้อมูลจริง</p>
                  <p className="mt-1 leading-6">{deleteRequestError}</p>
                </div>
              )}

              <DialogFooter className="relative mt-6 gap-3 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
                  onClick={() => setPendingDeleteForm(null)}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="h-12 rounded-2xl border-0 bg-[linear-gradient(135deg,#f97316_0%,#e11d48_100%)] px-5 text-white shadow-[0_16px_32px_rgba(225,29,72,0.24)] hover:opacity-95"
                  onClick={(event) => {
                    event.preventDefault();
                    if (pendingDeleteForm) {
                      void deleteHistoryForm(pendingDeleteForm);
                    }
                  }}
                  disabled={deletingFormId === pendingDeleteForm?.id}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingFormId === pendingDeleteForm?.id ? 'กำลังลบ...' : 'ยืนยันการลบ'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
