import type {
  ActionCtx,
  DatabaseReader,
  DatabaseWriter,
  MutationCtx,
  QueryCtx,
} from '../_generated/server'

export type ConvexActionCtx = ActionCtx
export type ConvexQueryCtx = QueryCtx
export type ConvexMutationCtx = MutationCtx
export type DbReader = DatabaseReader
export type DbWriter = DatabaseWriter

export type DbCtx = {
  db: DbReader | DbWriter
}
