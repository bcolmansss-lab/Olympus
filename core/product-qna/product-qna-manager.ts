/**
 * ProductQnAManager — product question & answer board: customer questions,
 * community/staff answers, answer voting, best-answer selection, and
 * unanswered-question tracking.
 *
 * Events:
 *   - "qna.question_asked": { questionId, productId }
 *   - "qna.answer_posted": { questionId, answerId, byStaff }
 *   - "qna.best_answer_selected": { questionId, answerId }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type QuestionStatus = "open" | "answered" | "closed";

export interface Answer {
  id: string;
  authorId: string;
  byStaff: boolean;
  body: string;
  votes: number;
  isBest: boolean;
  postedAt: string;
}

export interface Question {
  id: string;
  productId: string;
  authorId: string;
  body: string;
  status: QuestionStatus;
  answers: Answer[];
  askedAt: string;
}

export interface QnASummary {
  totalQuestions: number;
  answered: number;
  unanswered: number;
  totalAnswers: number;
  staffAnswerPct: number;
  answerRatePct: number;
}

export class ProductQnAManager {
  private questions: Map<string, Question> = new Map();

  constructor(private readonly bus: EventBus) {}

  ask(productId: string, authorId: string, body: string): Question {
    const question: Question = { id: randomUUID(), productId, authorId, body, status: "open", answers: [], askedAt: new Date().toISOString() };
    this.questions.set(question.id, question);
    this.bus.publish("qna.question_asked", { questionId: question.id, productId });
    return question;
  }

  answer(questionId: string, authorId: string, body: string, byStaff = false): Answer | undefined {
    const q = this.questions.get(questionId);
    if (!q || q.status === "closed") return undefined;
    const answer: Answer = { id: randomUUID(), authorId, byStaff, body, votes: 0, isBest: false, postedAt: new Date().toISOString() };
    q.answers.push(answer);
    if (q.status === "open") q.status = "answered";
    this.bus.publish("qna.answer_posted", { questionId, answerId: answer.id, byStaff });
    return answer;
  }

  voteAnswer(questionId: string, answerId: string): Answer | undefined {
    const q = this.questions.get(questionId);
    const answer = q?.answers.find(a => a.id === answerId);
    if (!answer) return undefined;
    answer.votes += 1;
    return answer;
  }

  selectBestAnswer(questionId: string, answerId: string): Question | undefined {
    const q = this.questions.get(questionId);
    if (!q) return undefined;
    const answer = q.answers.find(a => a.id === answerId);
    if (!answer) return undefined;
    for (const a of q.answers) a.isBest = false;
    answer.isBest = true;
    q.status = "closed";
    this.bus.publish("qna.best_answer_selected", { questionId, answerId });
    return q;
  }

  getQuestion(id: string): Question | undefined { return this.questions.get(id); }
  listQuestions(productId?: string, status?: QuestionStatus): Question[] {
    let all = Array.from(this.questions.values());
    if (productId) all = all.filter(q => q.productId === productId);
    if (status) all = all.filter(q => q.status === status);
    return all;
  }
  unanswered(): Question[] { return Array.from(this.questions.values()).filter(q => q.status === "open"); }

  summary(): QnASummary {
    const questions = Array.from(this.questions.values());
    const answers = questions.flatMap(q => q.answers);
    const staffAnswers = answers.filter(a => a.byStaff).length;
    const answered = questions.filter(q => q.status !== "open").length;
    return {
      totalQuestions: questions.length,
      answered,
      unanswered: questions.filter(q => q.status === "open").length,
      totalAnswers: answers.length,
      staffAnswerPct: answers.length > 0 ? Math.round((staffAnswers / answers.length) * 100) : 0,
      answerRatePct: questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0,
    };
  }
}
