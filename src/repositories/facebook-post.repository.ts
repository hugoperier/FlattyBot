import { supabase } from '../config/supabase';
import { FacebookPost } from '../types/database';

export class FacebookPostRepository {
    /**
     * Get a Facebook post by its post_id
     */
    async getPostByPostId(postId: string): Promise<FacebookPost | null> {
        const { data, error } = await supabase
            .from('facebook_posts')
            .select('*')
            .eq('post_id', postId)
            .single();

        if (error) {
            console.error('Error fetching Facebook post:', error);
            return null;
        }
        return data;
    }

    /**
     * Get the mobile permalink URL for a post
     */
    async getMobilePermalink(postId: string): Promise<string | null> {
        const post = await this.getPostByPostId(postId);

        if (!post) {
            console.warn(`No Facebook post found for post_id: ${postId}`);
            return null;
        }

        const permalink = post.input_data?.permalink?.mobile;

        if (!permalink) {
            console.warn(`No mobile permalink found for post_id: ${postId}`);
            // Fallback to canonical or raw if mobile not available
            return post.input_data?.permalink?.canonical ||
                post.input_data?.permalink?.raw ||
                null;
        }

        return permalink;
    }
}
